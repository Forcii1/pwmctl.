#include <atomic>
#include <chrono>
#include <csignal>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <memory>
#include <string>
#include <thread>
#include <vector>

#include "json.hpp"

#include "gpu/gpu.hpp"
#include "gpu/gpu_amd.hpp"

#ifdef HAVE_NVIDIA
#include "gpu/gpu_nvidia.hpp"
#endif

#include "socket/socket_utils.hpp"
#include "utility/hwmon_utils.hpp"

using json = nlohmann::json;

std::atomic<bool> running(true);

std::unique_ptr<Gpu> create_gpu() {
#ifdef HAVE_NVIDIA
    {
        auto gpu = std::make_unique<NvidiaGpu>();
        if (gpu->init()) {
            std::cout << "Using NVIDIA GPU\n";
            return gpu;
        }
    }
#endif

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

template <typename T>
T getOr(const json& j, const std::string& key, T def) {
    if (j.contains(key) && !j.at(key).is_null()) {
        try { return j.at(key).get<T>(); } catch (...) { return def; }
    }
    return def;
}

// Wendet Overclocking-Einstellungen aus der Config an, aber nur wenn sich
// etwas geaendert hat (die GPU-APIs sollen nicht jede Sekunde neu getriggert werden).
void applyOverclock(std::unique_ptr<Gpu>& gpu, json& j) {
    static bool oc_was_enabled = false;
    static int last_power_limit = INT32_MIN;
    static int last_core_offset = INT32_MIN;
    static int last_mem_offset  = INT32_MIN;

    json& oc = j["Overclock"];

    bool enabled     = getOr<bool>(oc, "enabled", false);
    int power_limit  = getOr<int>(oc, "power_limit_w", -1);
    int core_offset  = getOr<int>(oc, "core_offset_mhz", 0);
    int mem_offset   = getOr<int>(oc, "mem_offset_mhz", 0);

    if (enabled) {
        if (power_limit != last_power_limit && power_limit > 0) {
            gpu->change_wattage(power_limit);
            last_power_limit = power_limit;
        }
        if (core_offset != last_core_offset) {
            gpu->change_core_clock(core_offset);
            last_core_offset = core_offset;
        }
        if (mem_offset != last_mem_offset) {
            gpu->change_mem_clock(mem_offset);
            last_mem_offset = mem_offset;
        }
        oc_was_enabled = true;
    } else if (oc_was_enabled) {
        // Beim Deaktivieren werden nur die Clock-Offsets zurueckgesetzt (0 = Standard).
        // Das Power-Limit bleibt bewusst auf dem zuletzt gesetzten Wert, da wir hier
        // keine Hardware-Grenzwerte mehr abfragen, um sicher auf "Werksdefault" zurueckzusetzen.
        gpu->change_core_clock(0);
        gpu->change_mem_clock(0);

        oc_was_enabled = false;
        last_power_limit = INT32_MIN;
        last_core_offset = INT32_MIN;
        last_mem_offset  = INT32_MIN;
    }
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
    const std::filesystem::path CONFIGpath = std::filesystem::path(std::getenv("HOME")) / ".config" / "pwmctl.conf";
    const std::filesystem::path STATUSpath = std::filesystem::path(std::getenv("HOME")) / ".cache" / "pwmctl-status.json";
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
        auto& overclocksettings = j["Overclock"];

        gputemp=gpu->tempforpwmctl();

        cputemp=readfile(CPUtemppath)/1000;

        applyOverclock(gpu, j);

        for (unsigned int i=1;i <fanCount;i++) {
            int pwm =getpwm(fans,curves,std::to_string(i),gputemp,cputemp);
            pwm=int(pwm*2.55);
            setpwm(pwm,fanpath,std::to_string(i));
        }
        for(unsigned int i=0;i <gpus.size();i++){
            int pwm= getpwm(gpus,curves,std::to_string(i),gputemp,cputemp);

            //gpu->setpwm(pwm,i);
            gpu->setpwm2(gpus,curves,pwm,std::to_string(i),gputemp,cputemp,i);
        }
        //Overclocking
        //There should be some kind of reading for min and max limit and offset
        if(overclocksettings["enabled"]){
            gpu->change_wattage(overclocksettings["power_limit_w"]);
            //gpu->change_core_clock(overclocksettings["core_offset_mhz"]);
            //gpu->change_mem_clock(overclocksettings["mem_offset_mhz"]);
        }
        
        //safe temp and fan data
        json status;
        status["cpu_temp"] = cputemp;
        status["gpu_core_temp"] = gpu->core_temp();
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