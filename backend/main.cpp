#include <chrono>
#include <string>
#include <thread>
#include "json.hpp"
#include <csignal>
#include <atomic>


#include "gpu/gpu_amd.hpp"
#include "gpu/gpu_nvidia.hpp"
#include "socket/socket_utils.hpp"
#include "utility/hwmon_utils.hpp"

#include <memory>
#include <iostream>
using json = nlohmann::json;

std::atomic<bool> running(true);

std::unique_ptr<Gpu> create_gpu() {
    {
        auto gpu = std::make_unique<NvidiaGpu>();
        if (gpu->init()) {
            std::cout << "Using NVIDIA GPU\n";
            return gpu;
        }
    }

    {
        auto gpu = std::make_unique<AmdGpu>();
        if (gpu->init()) {
            std::cout << "Using AMD GPU\n";
            return gpu;
        }
    }

    return nullptr;
}



int calcpwm(int temps[], int pwms[], int temp, int length){
    for(int i=0;i<length;i++){
        if(temp<=temps[i]){
            if(i==0){
                return pwms[0];
            }
            return (((pwms[i]-pwms[i-1])/(temps[i]-temps[i-1]))*(temp-temps[i-1])+pwms[i-1]);
        }
    }
    //Emergency 
    return 255;

}

json loadconf(const std::filesystem::path config){
    std::ifstream file(config);
    if (!file) {
        std::cerr << "Konnte die Datei nicht öffnen!" << std::endl;
        return 1;
    }
    json j;
    file >> j;
    file.close(); 
    return j;
}

int getfans(const std::string PATH){
    int i=1;
    while(true){
        std::ifstream f(PATH+"pwm"+std::to_string(i));
        if(!f.good()){
            return i-1;
        }
        i++;
    }
}

int getpwm(nlohmann::json& type,nlohmann::json& curves, std::string num,int GPUTEMP, int CPUTEMP){
    int pwm =0;
    std::string curve= type[num]["curve"];
    if(type[num]["enabled"]){
        pwm=type[num]["value"];
    }else if(!type[num]["enabled"] && stoi(curve)>0){
        std::vector<int> temps_vec = curves[curve]["temps"].get<std::vector<int>>();
        std::vector<int> pwms_vec  = curves[curve]["pwms"].get<std::vector<int>>();
        int* temps = temps_vec.data();
        int* pwms = pwms_vec.data();
        switch (int(curves[curve]["source"])) {
            case 0:
                pwm = calcpwm(temps, pwms, CPUTEMP, temps_vec.size());
                break;
            case 1:
                pwm = calcpwm(temps, pwms, GPUTEMP, temps_vec.size());
                break;
            case 2:
                pwm = calcpwm(temps, pwms, CPUTEMP>GPUTEMP ? CPUTEMP : GPUTEMP, temps_vec.size());
                break;
        }
    }
    else if (!type[num]["enabled"] && stoi(curve) <= 0) {
        return -1;  // Nicht senden
    }
    return pwm;
}

bool setpwm(int pwm,std::string path,std::string num){
    if(pwm==-1){
        send_command(path+"pwm"+num+"_enable", 2);
        return 1;
    }else if (pwm>=0 && pwm <=255) {
        send_command(path+"pwm"+num+"_enable", 1);
        send_command(path+"pwm"+(num), pwm);
        return 1;
    }
    return 0;
}

int initfancontrol(int a, std::string path,int count){

    for(int i=1;i<count;i++){
        if(!send_command(path+"pwm"+std::to_string(i)+"_enable", a)) break; 
        if(i==20) {
            break;
        }
    }
    return 0;
}



void signal_handler(int sig) {
    std::cout<<running<<std::endl;
    running = false;
}

int main (){
    
    //signal handler
    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);
    //vars

    auto gpu = create_gpu();

    if (!gpu) {
        std::cerr << "No supported GPU found\n";
        return 1;
    }

    //init PAtHS
    const std::filesystem::path CONFIGpath =std::filesystem::path(std::getenv("HOME")) / ".config" / "pwmctl.conf";
    const std::filesystem::path STATUSpath =
    std::filesystem::path(std::getenv("HOME")) / ".cache" / "pwmctl-status.json";
    std::filesystem::create_directories(STATUSpath.parent_path());

    const auto CPUpath = searchpath("k10temp","k8temp", "coretemp");
    const std::filesystem::path CPUtemppath=CPUpath+"temp1_input";
    const auto fanpath = searchpath(
    "it8","nct","w83","f718", "f71805f","asus","dell-smm","sch56"
    );       



    json j=loadconf(CONFIGpath);
    auto& fans = j["Fans"];

    int fanCount = fans.size();

    int gputemp;
    int cputemp;

    while (running) {
        //reload config if changes are made
        json j=loadconf(CONFIGpath);
        auto& fans = j["Fans"];
        auto& curves = j["Curves"];
        std::size_t fanCount = fans.size();
        auto& gpus = j["Gpus"];

        gputemp=gpu->core_temp(); //maybe control my temp
        cputemp=readfile(CPUtemppath)/1000;

        for (unsigned int i=1;i <=fanCount;i++) {
            int pwm=getpwm(fans,curves,std::to_string(i),gputemp,cputemp);
            setpwm(pwm,fanpath,std::to_string(i));
        }
        int pwm= getpwm(gpus,curves,std::to_string(0),gputemp,cputemp);
        gpu->setpwm(pwm);
        //safe temp and fan data
        json status;
        status["cpu_temp"] = cputemp;
        status["gpu_core_temp"] = gputemp;
        status["gpu_hotspot_temp"] = gpu->hotspot_temp();
        status["gpu_vram_temp"] = gpu->vram_temp();

        status["gpu_fan_percent"] = gpu->fan_speed_percent();
        status["gpu_fan_rpm"] = gpu->fan_speed_rpm();
        
        status["gpu_volt_mv"] = gpu->voltage_mv();
        status["gpu_power_w"] = gpu->power_w();
        status["gpu_vram_used"] = gpu->used_vram_gb();
        status["gpu_vram_total"] = gpu->total_vram_gb();

        status["gpu_core_clock"] = gpu->core_clock();
        status["gpu_mem_clock"] = gpu->mem_clock();

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
    gpu->shutdown();
    //insert amd auto?
    return 0;
}