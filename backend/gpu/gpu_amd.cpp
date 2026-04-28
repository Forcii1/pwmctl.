#include "gpu_amd.hpp"
#include "../utility/hwmon_utils.hpp"
#include "../socket/socket_utils.hpp"
#include <iostream>
#include <vector>

bool AmdGpu::write_enable(int val){
    for (const auto& fan : fans) {
        send_command("SET "+path.string()+"pwm"+std::to_string(fan)+"_enable",val);
    }
    return 1;
}

std::string AmdGpu::searchdrm(const std::string& vendor_id){
    for (const auto& entry : std::filesystem::directory_iterator("/sys/class/drm")) {

        // nur cardX, kein renderD etc.
        std::string name = entry.path().filename().string();
        if (!name.starts_with("card"))
            continue;

        std::ifstream vendor_file(entry.path() / "device/vendor");
        if (!vendor_file)
            continue;

        std::string vendor;
        std::getline(vendor_file, vendor);

        if (vendor.find(vendor_id) != std::string::npos) {
            return (entry.path() / "device/").string();
        }
    }

    return "NONE";
}

bool AmdGpu::init(){
    path = searchpath("amdgpu");
    drm_path=searchdrm("0x1002");
    if (path.string()!="NONE"){
        //init amd fan controll

        temp_edge_path = path.string()+"temp1_input";
        temp_mem_path = path.string()+"temp3_input";
        temp_junc_path = path.string()+"temp2_input";
  
        voltage_path = path.string()+"in0_input";
        power_path = path.string()+"power1_average";


        core_clock_path= path.string()+"freq1_input";
        mem_clock_path= path.string()+"freq2_input";


        fans=get_fanslist();
        write_enable(1);
    }
    if (drm_path.string()!="NONE"){
        used_vram_path=drm_path.string()+"mem_info_vram_used";
        total_vram_path=drm_path.string()+"mem_info_vram_total";

    }
    std::cerr << "No AMDGPU found!\n";
    return path.string()!="NONE" && drm_path.string()!="NONE";
}

int AmdGpu::core_temp(){
    return readfile(temp_edge_path)/1000;
}

int AmdGpu::hotspot_temp(){
    return readfile(temp_junc_path)/1000;
}

int AmdGpu::vram_temp(){
    return readfile(temp_mem_path)/1000;
}

std::vector<int>AmdGpu::fan_speed_rpm(){
    std::vector<int> speeds;
    for (const auto& fan : fans) {
        speeds.push_back(readfile(path.string()+"fan"+std::to_string(fan)+"_input"));
    }
    return speeds;
}

std::vector<int>AmdGpu::fan_speed_percent(){
    std::vector<int> speeds;
    for (const auto& fan : fans) {
        int speed= readfile(path.string()+"pwm"+std::to_string(fan));
        speeds.push_back(int(speed/2.55));
    }
    return speeds;
}

int AmdGpu::voltage_mv(){
    return readfile(voltage_path)*1000;
}

int AmdGpu::power_w(){
    return readfile(power_path)/1000000;
}

float AmdGpu::used_vram_gb(){
    return (readfile(used_vram_path)/10000000.0)/100.0;
}

float AmdGpu::total_vram_gb(){
    return (readfile(total_vram_path)/10000000.0)/100.0;
}

int AmdGpu::core_clock(){
    return (readfile(core_clock_path)/1000000);
}

int AmdGpu::mem_clock(){
    return (readfile(mem_clock_path)/1000000);
}

bool AmdGpu::setpwm(int pwm, int select=-1){//Add Multifan Support later -> select
    if(select<0){
        for (const auto& fan : fans) {
            send_command(path.string()+"pwm"+std::to_string(fan), pwm);
        }
    }else{
        send_command(path.string()+"pwm"+std::to_string(select), pwm);
    }
    return true;
}

void AmdGpu::shutdown(){
    write_enable(2);
}

std::vector<int> AmdGpu::get_fanslist() {
    std::vector<int> result;
    for (const auto& entry : std::filesystem::directory_iterator(path)) {
        std::string name = entry.path().filename().string();
        if (name.starts_with("fan") && name.ends_with("_input")) {
            std::string num_str = name.substr(3, name.find('_') - 3);
            result.push_back(std::stoi(num_str));
        }
    }
    return result;
}

