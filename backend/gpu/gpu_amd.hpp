#include "gpu.hpp"
#include <filesystem>

class AmdGpu : public Gpu {
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
        
        virtual bool setpwm(int pwm, int fan) override;
    

        virtual bool change_wattage(int watt) override;
        virtual bool change_core_clock(int hz) override;
        virtual bool change_mem_clock(int hz) override;
        virtual bool change_voltage(int volt) override;


    private:
        std::vector<int> get_fanslist();
        bool write_enable(int val);
        std::string searchdrm(const std::string& vendor_id);

        std::filesystem::path path;

        std::filesystem::path drm_path;
            
        std::filesystem::path temp_edge_path;
        std::filesystem::path temp_mem_path;
        std::filesystem::path temp_junc_path;

        std::vector<int> fans;


        std::filesystem::path voltage_path;
        std::filesystem::path power_path;
        std::filesystem::path used_vram_path;
        std::filesystem::path total_vram_path;


        std::filesystem::path core_clock_path;
        std::filesystem::path mem_clock_path;

};