#pragma once
#include <vector>

class Gpu {
public:
    virtual ~Gpu() = default;
    
    virtual bool init() = 0;
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

};

