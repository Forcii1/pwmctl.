#include "gpu_nvidia.hpp"
#include "../socket/socket_utils.hpp"
#include <iostream>
#include <string>
#include <vector>


bool NvidiaGpu::init() {
    int max_tries=50;
    nvmlReturn_t result;
    bool nvml_ok=false;
    bool nvapi_ok=false;

    for(int i=0;i<max_tries;i++){
        std::cerr << "NVML not ready, retrying..." << std::endl;
        result = nvmlInit();
        if (NVML_SUCCESS != result) {
            std::cerr << "NVML Init failed: " << nvmlErrorString(result) << "\n";
            device = NULL;
            std::cerr << "NVML failed to initialize after retries!" << std::endl;
            continue;
        }

        result = nvmlDeviceGetHandleByIndex(0, &device);
        if (NVML_SUCCESS != result) {
            std::cerr << "Failed to get device handle: " << nvmlErrorString(result) << "\n";
            nvmlShutdown();
            device = NULL;
            std::cerr << "NVML failed to initialize after retries!" << std::endl;
            continue;
        }
        std::cerr<<"NVML connected!\n";
        nvml_ok=true;
        break;
    }
    
    for(int i=0;i<max_tries;i++){
        if(nvapi.init()){
            nvapi_ok=true;
            std::cerr<<"NVAPI connected!\n";
            break;
        }  
        std::cerr<<"NVAPI failed!\n";
    }

    fancount=get_fanslist();
    return nvapi_ok && nvml_ok;
}   

int NvidiaGpu::fallback(const char* cmd) {
    FILE* f = popen(cmd, "r");
    if (!f) return -1;

    char buf[64];
    if (!fgets(buf, sizeof(buf), f)) {
        pclose(f);
        return -1;
    }
    pclose(f);

    return atoi(buf);
}

float NvidiaGpu::nvmlCall(char metric){
    switch(metric) {
        case 'u': {
            nvmlUtilization_t u;
            if (nvmlDeviceGetUtilizationRates(device, &u) == NVML_SUCCESS)
                return u.gpu;
            break;
        }
        case 'c': {
            unsigned int core_clock;
            if (nvmlDeviceGetClockInfo(device, NVML_CLOCK_GRAPHICS, &core_clock) == NVML_SUCCESS)
                return core_clock;
            break;
        }
        case 'm': {
            unsigned int mem_clock;
            if (nvmlDeviceGetClockInfo(device, NVML_CLOCK_MEM, &mem_clock) == NVML_SUCCESS)
                return mem_clock;
            break;
        }
        case 't': {
            unsigned int temp;
            if (nvmlDeviceGetTemperature(device, NVML_TEMPERATURE_GPU, &temp) == NVML_SUCCESS)
                return temp;
            break;
        }
        case 'p': {
            unsigned int milliwatts = 0;
            if (nvmlDeviceGetPowerUsage(device, &milliwatts) == NVML_SUCCESS)
                return int(milliwatts / 1000.0f); // convert mW → W
            break;
        }
        case 'n':{
            nvmlMemory_t mem;
            if (nvmlDeviceGetMemoryInfo(device, &mem) == NVML_SUCCESS) {
                return int((mem.used / 1024 / 1024 / 1024.0f )*100)/100.0f;  // bytes → GB
            }
            break;
        }
        //percent
        case 'b':{
            nvmlMemory_t mem;
            if (nvmlDeviceGetMemoryInfo(device, &mem) == NVML_SUCCESS) {
                return int((mem.total/ 1024 / 1024 / 1024.0f )*100)/100.0f;  
            }
            break;
        }
    }
    return 0;
}

std::vector<int> NvidiaGpu::fan_speed_percent(){
    std::vector<int> speeds;
    nvmlReturn_t r;
    for (unsigned int fan = 0; fan < fancount; fan++) {
        unsigned int f;
        unsigned int percent = 0;
        r = nvmlDeviceGetFanSpeed_v2(device, fan, &percent);

        if (r == NVML_SUCCESS) {
            f = percent;
        } else {
            std::cerr << "Fan error: " << nvmlErrorString(r) << "\n";
            std::string cmd ="nvidia-settings --display=:0 -q [fan:" + std::to_string(fan) + "]/GPUCurrentFanSpeed -t 2>/dev/null";
            f = fallback(cmd.c_str());
        }
        speeds.push_back(f);
    }
    return speeds;
}

std::vector<int> NvidiaGpu::fan_speed_rpm(){
    int f = -1;
    std::vector<int> speeds;
    nvmlReturn_t r;
    nvmlFanSpeedInfo_t rpm_info {};
    for (unsigned int fan = 0; fan < fancount; fan++) {

        rpm_info.version = nvmlFanSpeedInfo_v1;
        rpm_info.fan = fan;
        r = nvmlDeviceGetFanSpeedRPM(device, &rpm_info);

        if (r == NVML_SUCCESS) {
            f = rpm_info.speed;
        } else {
            std::cerr << "Fan error: " << nvmlErrorString(r) << "\n";
            f=0;
        }
        speeds.push_back(f);
    }
    return speeds;
}

int NvidiaGpu::voltage_mv(){
    NvidiaNvApiStats stats = nvapi.read_stats();
    if (stats.available&& stats.voltage_available) {
        double voltage = stats.voltage_mv;
        return voltage;
    } else {
        return 0;
    }
}

int NvidiaGpu::hotspot_temp(){
    NvidiaNvApiStats stats = nvapi.read_stats();
    if (stats.available && stats.hotspot_available) {
        int hotspot_temp = stats.hotspot_temp;
        return hotspot_temp;
    } else {
        return 0;
    }
}

int NvidiaGpu::core_temp(){
    return nvmlCall('t');
}


int NvidiaGpu::vram_temp(){
    NvidiaNvApiStats stats = nvapi.read_stats();
    if (stats.available && stats.vram_temp) {
        int vram_temp = stats.vram_temp;
        return vram_temp;
    } else {
        return 0;
    }
}

void NvidiaGpu::shutdown(){
    send_command("NVIDIASTATE",0);
    nvapi.shutdown();
    nvmlShutdown();
}

unsigned int NvidiaGpu::get_fanslist(){
    unsigned int fan_count = 0;
    nvmlReturn_t r= nvmlDeviceGetNumFans(device,&fan_count);
    if (r != NVML_SUCCESS) {
        std::cerr << "nvmlDeviceGetCount failed: " << nvmlErrorString(r) << "\n";
        return 0;
    }
    return fan_count;
}

int NvidiaGpu::power_w(){
    return nvmlCall('p');
}

float NvidiaGpu::used_vram_gb(){
    return nvmlCall('n');
}
float NvidiaGpu::total_vram_gb(){
    return nvmlCall('b');
}
int NvidiaGpu::core_clock(){
    return nvmlCall('c');

}
int NvidiaGpu::mem_clock(){
    return nvmlCall('m');

}

bool NvidiaGpu::setpwm(int pwm, int fan){
    pwm=int(pwm/2.55);
    bool all=false;
    static std::vector<int> lastpwm;
    if (lastpwm.size() != fancount) {
        lastpwm.assign(fancount, -1);
    }
    if(fan<0){
        fan=0;
        all=true;
    }
    
    if(lastpwm[fan]<=30 && pwm<=30){
        return 1;
    }
    else if(pwm<30&&lastpwm[fan]>=30){
        send_command("NVIDIASTATE "+std::to_string(fan),0);
        lastpwm[fan]=pwm;
        return 1;
    }
    else if(lastpwm[fan]<30&&pwm>=30){
        send_command("NVIDIASTATE "+std::to_string(fan),1);
        lastpwm[fan]=pwm;
        return 1;
    }
    if(all){
        for (unsigned int select = 0; select < fancount; select++) {
            send_command("NVIDIA "+std::to_string(select), pwm); //fix bug in deamon which only controls fan #0!
            lastpwm[select]=pwm;
        }
        return 1;
    }
    send_command("NVIDIA "+std::to_string(fan), pwm);
    lastpwm[fan]=pwm;
    return 1;
}