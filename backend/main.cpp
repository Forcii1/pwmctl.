#include <chrono>
#include <fstream>
#include <string>
#include <thread>


#include "funcs.h"
#include "json.hpp"
#include "nvml.h"

using json = nlohmann::json;


int main (){

    //vars
    int GPUTEMP=0;
    int CPUTEMP=0;
    int nvi=0;
    nvmlDevice_t device;

    //init PAtHS
    const std::filesystem::path CPUtemppath = searchpath("k10temp")+"temp1_input";
    const std::filesystem::path AMDpath = searchpath("amdgpu");
    const std::filesystem::path AMDtemppath = AMDpath.string()+"temp1_input";
    const std::filesystem::path AMDfanpath = AMDpath.string()+"fan1_target";
    const std::filesystem::path CONFIGpath =std::filesystem::path(std::getenv("HOME")) / ".config" / "pwmctl.conf";

    const std::filesystem::path fanpath=searchpath("it86","it87");
    
    //When fanpth is NONE -> no driver found, try to install
    /*if(!fanpath.compare("NONE")){
        install_driver();
        return 0;
    }*/

    //init fans -> Control to manual
    writeall(1,fanpath);
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
    }
    
    while (true) {
        //reload config if changes are made
        json j=loadconf(CONFIGpath);
        auto& fans = j["Fans"];
        auto& curves = j["Curves"];
        std::size_t fanCount = fans.size();
        auto& gpus = j["Gpus"];
        
        //std::cout<<gpus<<std::endl;

        //system("clear");
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
        std::this_thread::sleep_for(std::chrono::seconds(3));

    }
    return 0;
}