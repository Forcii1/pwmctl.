#include <nvidia/nvml.h>
#include <vector>
#include "gpu.hpp"
#include "gpu_nvidia_nvapi.hpp"

class NvidiaGpu : public Gpu {
    public:
        bool init() override;

        int core_temp() override;
        int hotspot_temp() override;
        int vram_temp() override;

        std::vector<int> fan_speed_rpm() override;
        std::vector<int> fan_speed_percent() override;

        int voltage_mv() override;
        virtual int power_w() override;
        virtual float used_vram_gb() override;
        virtual float total_vram_gb() override;

        virtual int core_clock() override;
        virtual int mem_clock() override;

        void shutdown() override;

        virtual bool setpwm(int pwm,int fan) override;
    private:
        nvmlDevice_t device;
        NvidiaNvApi nvapi;
        int fallback(const char* cmd);
        unsigned int get_fanslist();
        unsigned int fancount;

        float nvmlCall(char metric);
};