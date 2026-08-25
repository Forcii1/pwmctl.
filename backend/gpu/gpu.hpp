#pragma once
#include <vector>
#include "../json.hpp"

using json = nlohmann::json;
class Gpu {
public:
    virtual ~Gpu() = default;
    
    virtual bool init() = 0;
    virtual int tempforpwmctl() = 0;
    virtual int core_temp() = 0;
    virtual int hotspot_temp() { return -1; }
    virtual int vram_temp() { return -1; }

    virtual std::vector<int> fan_speed_percent() = 0;
    virtual std::vector<int> fan_speed_rpm() = 0;
    
    virtual int voltage_mv() { return -1; }
    virtual int power_w() = 0;
    virtual float used_vram_gb() =0;
    virtual float total_vram_gb() =0;

    virtual int core_clock() =0;
    virtual int mem_clock() =0;

    virtual void shutdown() = 0;

    virtual bool setpwm(int pwm,int fan = -1) = 0;

    virtual bool setpwm2(nlohmann::json& type,nlohmann::json& curves,int pwm, std::string num,int GPUTEMP, int CPUTEMP,int fan = -1) = 0;

    virtual bool change_wattage(int watt) = 0;
    virtual bool change_core_clock(int mhz) = 0;
    virtual bool change_mem_clock(int mhz) = 0;
    virtual bool change_voltage(int volt) { return -1; }

};

