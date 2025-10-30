#include <chrono>
#include <fstream>
#include <thread>


#include "json.hpp"
#include "nvml.h"
#include "funcs.h"

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
    const std::filesystem::path AMDfanpath = AMDpath.string()+"pwm1";
    const std::filesystem::path CONFIGpath ="/home/hannes/programming/pwmfix/frontend/curves.json";
    const std::filesystem::path fanpath=searchpath("it86","it87");
    //When fanpth is NONE -> no driver found, try to install
    if(!fanpath.compare("NONE")){
        install_driver();
        return 0;
    }

    //init fans -> Control to manual
    //writeall(1,fanpath);

    if(searchpath("amdgpu")=="NONE"){
        nvi=1;
        //init nvidia driver
        device=nvmlinit();
    }

    while (true) {
        //reload config if changes are made
        json j=loadconf(CONFIGpath);
        auto& fans = j["Curves"];
        std::size_t fanCount = fans.size();
        auto& gpus = j["GPUS"];

        system("clear");
        if(nvi){
            GPUTEMP=nvitemp(device);
        }else {
            GPUTEMP=readfile(AMDtemppath)/1000;
        }
        CPUTEMP=readfile(CPUtemppath)/1000;

        for (unsigned int i=0;i <fanCount;i++) {
            int pwm =0;
            std::vector<int> temps_vec = fans[std::to_string(i)]["temps"].get<std::vector<int>>();
            std::vector<int> pwms_vec  = fans[std::to_string(i)]["pwms"].get<std::vector<int>>();
            int* temps = temps_vec.data();
            int* pwms = pwms_vec.data();
            switch ((int)fans[std::to_string(i)]["source"]) {
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
    
            
            std::cout<<fanpath.string() + (std::string)fans[std::to_string(i)]["Name"]<<std::endl<<pwm<<std::endl;
            writefile(fanpath.string() + (std::string)fans[std::to_string(i)]["Name"],pwm);
        }
        std::vector<int> temps_vec = gpus["GPU"]["temps"].get<std::vector<int>>();
        std::vector<int> pwms_vec  = gpus["GPU"]["pwms"].get<std::vector<int>>();
        int* temps = temps_vec.data();
        int* pwms = pwms_vec.data();
        if(nvi){
            setnvtemp(calcpwm(temps, pwms, GPUTEMP, temps_vec.size()));
        }else{
            int pwm = calcpwm(temps, pwms, GPUTEMP, temps_vec.size());
            writefile(AMDfanpath,pwm);
        }
        std::this_thread::sleep_for(std::chrono::seconds(3));

    }
    return 0;
}