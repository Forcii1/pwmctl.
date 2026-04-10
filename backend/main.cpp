#include <chrono>
#include <string>
#include <thread>
#include "funcs.cpp"
#include "json.hpp"
#include "../nvml.h"
#include <csignal>
#include <atomic>

using json = nlohmann::json;

std::atomic<bool> running(true);

void signal_handler(int sig) {
    std::cout<<running<<std::endl;
    running = false;
}

int main (){
    //signal handler
    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);
    //vars
    int GPUTEMP=0;
    int CPUTEMP=0;
    int nvi=0;
    nvmlDevice_t device;

    //init PAtHS
    const std::filesystem::path CPUtemppath = searchpath("k10temp")+"temp1_input";
    const std::filesystem::path AMDpath = searchpath("amdgpu");
    const std::filesystem::path AMDtemppath = AMDpath.string()+"temp1_input";
    const std::filesystem::path AMDfanpath = AMDpath.string()+"pwm1";
    const std::filesystem::path CONFIGpath =std::filesystem::path(std::getenv("HOME")) / ".config" / "pwmctl.conf";

    const std::filesystem::path STATUSpath =
    std::filesystem::path(std::getenv("HOME")) / ".cache" / "pwmctl-status.json";

    std::filesystem::create_directories(STATUSpath.parent_path());
    
    const std::filesystem::path fanpath=searchpath("it86","it87");


    json j=loadconf(CONFIGpath);
    auto& fans = j["Fans"];
    int fanCount = fans.size();

    if(AMDpath.string()=="NONE"){
        nvi=1;
        //init nvidia driver
        while (1) {
            device = nvmlinit();
            if (device) break;
            std::cerr << "NVML not ready, retrying..." << std::endl;
            std::this_thread::sleep_for(std::chrono::seconds(5));
        }
        if (!device) {
            std::cerr << "NVML failed to initialize after retries!" << std::endl;
            return 1;
        }
        std::cerr<<"NVML connected!\n";
    }else if (AMDpath.string()!="NONE"){
        //init amd fan controll
        send_command("SET "+AMDpath.string()+"pwm1_enable",1);
    }
    
    while (running) {
        //reload config if changes are made
        json j=loadconf(CONFIGpath);
        auto& fans = j["Fans"];
        auto& curves = j["Curves"];
        std::size_t fanCount = fans.size();
        auto& gpus = j["Gpus"];

        if(nvi){
            GPUTEMP=nvitemp(device);
        }else {
            GPUTEMP=readfile(AMDtemppath)/1000;
        }
        CPUTEMP=readfile(CPUtemppath)/1000;

        for (unsigned int i=1;i <=fanCount;i++) {
            setpwm(fans,curves,std::to_string(i),fanpath,0,GPUTEMP,CPUTEMP);
        }
        setpwm(gpus,curves,std::to_string(0),AMDfanpath,(nvi?1:2),GPUTEMP,CPUTEMP);

        //safe temp and fan data
        json status;
        status["cpu_temp"] = CPUTEMP;
        status["gpu_temp"] = GPUTEMP;
        if (nvi) {
            status["gpu_fan_percent"] = get_nvidia_fan(device);
            status["gpu_fan_rpm"] = nullptr;
        } else {
            status["gpu_fan_percent"] = nullptr;
            status["gpu_fan_rpm"] = readfile(AMDpath.string() + "fan1_input");
        }
        status["fan_count"] = fanCount;
        
        

        std::filesystem::path tmp = STATUSpath;
        tmp += ".tmp";

        std::ofstream statusFile(tmp);
        if (statusFile) {
            statusFile << status.dump();
            statusFile.close();
            std::filesystem::rename(tmp, STATUSpath);
        }

        std::this_thread::sleep_for(std::chrono::seconds(1));
    }
    std::cout<<"Shutting down!\n";
    initfancontrol(2, fanpath, fanCount);
    if(nvi){
        send_command("NVIDIASTATE",0);
    }else{
        send_command("SET "+AMDpath.string()+"pwm1_enable",2);
    }
    //insert amd auto?
    return 0;
}