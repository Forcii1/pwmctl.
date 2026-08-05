#include "gpu_amd.hpp"
#include "../utility/hwmon_utils.hpp"
#include "../socket/socket_utils.hpp"
#include <iostream>
#include <vector>

#define AMDCONTROLPOINTS 5 

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
    drm_path = searchdrm("0x1002");

    if (path.string() == "NONE" || drm_path.string() == "NONE") {
        std::cerr << "No AMDGPU found!\n";
        return false;
    }

    // init amd fan control
    temp_edge_path = path.string() + "temp1_input";
    temp_mem_path  = path.string() + "temp3_input";
    temp_junc_path = path.string() + "temp2_input";

    voltage_path = path.string() + "in0_input";
    power_path   = path.string() + "power1_average";

    core_clock_path = path.string() + "freq1_input";
    mem_clock_path  = path.string() + "freq2_input";

    used_vram_path  = drm_path.string() + "mem_info_vram_used";
    total_vram_path = drm_path.string() + "mem_info_vram_total";

    fans = get_fanslist();
    write_enable(1);

    return true;
}

int AmdGpu::tempforpwmctl(){
    return AmdGpu::hotspot_temp();
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
    return readfile(voltage_path);
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

//DOES ONLY WORK WITH OLDER VERSIONS
bool AmdGpu::setpwm(int pwm, int fan=-1){
    old_pwm(pwm, fan);
    return 0;
}

int get_list_points(int temps[], int temp, int length){
    if (length<=AMDCONTROLPOINTS){
        return length;
    }else{
        for(int i=0;i<length;i++){
            if(temps[i]>temp){
                return i+((length-i)>= 2 ? 2 : (length-i))+1;
            }
        }
    }

    return 1;
}

std::vector<int> setarraytoval(std::vector<int> pwms_vec,int pwm){
    for(int i=0;i<AMDCONTROLPOINTS;i++){
        pwms_vec.at(i)=pwm;
    }
    return pwms_vec;
}

bool AmdGpu::setpwm2(nlohmann::json& type,nlohmann::json& curves,int pwm, std::string num,int GPUTEMP, int CPUTEMP,int fan){
    //Mutlifan not supported!
    int temps_for_driver[AMDCONTROLPOINTS];
    int pwms_for_driver[AMDCONTROLPOINTS];
    int zrpm=0;
    static int old_pwms_for_driver[AMDCONTROLPOINTS] = {0};
    //static int oldpoint=0;

    std::string curve= type[num]["curve"];
    if(type[num]["enabled"]){
        zrpm=0;
        for(int i=0;i<AMDCONTROLPOINTS;i++){
            pwms_for_driver[i]=type[num]["value"];
            temps_for_driver[i]=15*i+30;
        }
    }else if(!type[num]["enabled"] && stoi(curve)>0){
        std::vector<int> temps_vec = curves[curve]["temps"].get<std::vector<int>>();
        std::vector<int> pwms_vec  = curves[curve]["pwms"].get<std::vector<int>>();
        int* temps = temps_vec.data();
        int point=0;
        
            
        switch (int(curves[curve]["source"])) {
            //If there is another temp source selected, there should be a "direct mode" as in the first "if-block"
            //Otherwise the right curvepoints get selected but the card controls itself in the curve with the hotspot temp, so there would be a wrong output.
            //This mode, altough it is complicated, is still left in because this is the "normal" usecase mode which most users would use. it is also the most efficent one because the curve register is only written when needed and the card can mostly control itself.
            case 0://cpu
                pwms_vec=setarraytoval(pwms_vec, pwm);
                break;
            case 1://gpu
                point = get_list_points(temps, GPUTEMP, temps_vec.size());
                break;
            case 2://higher
                pwms_vec=setarraytoval(pwms_vec, pwm);
                break;
        }
        for(int i=0;i<AMDCONTROLPOINTS;i++){

            pwms_for_driver[i]=int(pwms_vec.at(point-AMDCONTROLPOINTS+i <= 0 ? 0 : point-AMDCONTROLPOINTS+i));
            if (pwms_for_driver[i] <30){
                zrpm=1;
            }
            pwms_for_driver[i]= pwms_for_driver[i] <30 ? 30 : pwms_for_driver[i];

            temps_for_driver[i]=temps_vec.at(point-AMDCONTROLPOINTS+i <= 0 ? 0 : point-AMDCONTROLPOINTS+i);
            temps_for_driver[i]= temps_for_driver[i] < 25 ? 25: temps_for_driver[i];
        }

        /*if((oldpoint-AMDCONTROLPOINTS<=point and oldpoint >= point)){
            memcpy(old_pwms_for_driver, pwms_for_driver, sizeof(pwms_for_driver));
        }
        oldpoint=point;*/
        
    }
    if((memcmp(pwms_for_driver, old_pwms_for_driver, sizeof(pwms_for_driver)) != 0)){
        send_command_amdgpu(path.string()+"device/gpu_od/fan_ctrl/fan_curve", pwms_for_driver,temps_for_driver, AMDCONTROLPOINTS,zrpm);
        memcpy(old_pwms_for_driver, pwms_for_driver, sizeof(pwms_for_driver));

    }
    
    return 0;
}

int AmdGpu::old_pwm(int pwm, int fan=-1){
    if(fan>0){
        for(int i=0;i<fan;i++){
            send_command(path.string()+"pwm"+std::to_string(fan), pwm);
        }
    }else{
        send_command(path.string()+"pwm0", pwm);
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

bool AmdGpu::change_wattage(int watt) {
    return false;
}

bool AmdGpu::change_core_clock(int hz) {
    return false;
}

bool AmdGpu::change_mem_clock(int hz) {
    return false;
}

bool AmdGpu::change_voltage(int mv) {
    return false;
}