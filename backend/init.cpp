#include <chrono>
#include <filesystem>
#include <fstream>
#include <ostream>
#include <string>
#include <thread>
#include <iostream>

#include "nvml.h"
#include "json.hpp"
#include "funcs.h"

int fancahnge(std::string path){
    std::this_thread::sleep_for(std::chrono::seconds(2));
    int speedbe=0;
    int speedaf=0;
    speedbe=readfile(path);
    while (true) {
        std::this_thread::sleep_for(std::chrono::seconds(2));
        speedaf=readfile(path);
        if(speedaf-10<=speedbe && speedaf+10>=speedbe){
            return 1;
        }
        speedbe=speedaf;
        std::cout<<"PWM: "<<speedaf<<" PWM\r"<<std::flush;
        
    }
}


int main(){
    const char* home = std::getenv("HOME");
    std::ifstream f(std::filesystem::path(home).string()+"/.config/pwmctl");
    if(f.good()){
        return 0;
    }
    const std::filesystem::path fanpath=searchpath("it86","it87");
    if(!fanpath.compare("NONE")){
        install_driver();
        return 0;
    }
    int fancount=getfans(fanpath);
    nlohmann::ordered_json j;
    for (int i=1;i<=fancount;i++){
        int mode=readfile(fanpath.string()+"pwm"+std::to_string(i)+"_enable");
        send_pwm_command(fanpath.string()+"pwm"+std::to_string(i)+"_enable",1);
        std::cout<<"Fan "<<i<<std::endl;
        int maxspeed=0;
        int minspeed=0;
        send_pwm_command(fanpath.string()+"pwm"+std::to_string(i),0);
        std::cout<<"slowing fan down\n";
        fancahnge(fanpath.string()+"fan"+std::to_string(i)+"_input");
        minspeed=readfile(fanpath.string()+"fan"+std::to_string(i)+"_input");
        std::cout<<"min speed: "<<minspeed<<" RPM\n";

        std::cout<<"\nspeeding fan up\n";
        send_pwm_command(fanpath.string()+"pwm"+std::to_string(i),255);
        fancahnge(fanpath.string()+"fan"+std::to_string(i)+"_input");
        maxspeed=readfile(fanpath.string()+"fan"+std::to_string(i)+"_input");
        std::cout<<"max speed: "<<maxspeed<<" RPM\n";
        send_pwm_command(fanpath.string()+"pwm"+std::to_string(i),100);
        send_pwm_command(fanpath.string()+"pwm"+std::to_string(i)+"_enable",mode);

        j["Fans"]["pwm"+std::to_string(i)] = {
            {"name", "pwm"+std::to_string(i)},
            {"source", 0},
            {"func", ""},
            {"temps", {0}},
            {"pwm", {0}},
            {"minspeed", minspeed},
            {"maxspeed", maxspeed}
            
        };
        if(minspeed-25 <= maxspeed && minspeed+25>=maxspeed ){
            std::cerr<<"Can't control fan"<<i<<"!";
        }
        std::cout<<"\n\n\n";
    }

    nvmlDevice_t device;
    j["GPUS"]["GPU"]={
         {"name","GPU"},
         {"func","amdGPU"},
        {"temps", {0}},
        {"pwm", {0}}

    };
    if(searchpath("amdgpu")=="NONE"){
        j["GPUS"]["GPU"]={
            {"name","GPU"},
            {"func","nvidiaGPU"},
            {"temps", {0}},
            {"pwm", {0}}
        };
    }

    std::ofstream file(std::filesystem::path(home).string()+"/.config/pwmctl");
    file << j.dump(4);
    std::cout << "JSON written to fans_config.json\nDone!" << std::endl;

}