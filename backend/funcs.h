
#include <chrono>
#include <filesystem>
#include <fstream>
#include <thread>
#include <iostream>

#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

#include <nvidia/nvml.h>
#include "json.hpp"

using json = nlohmann::json;
#define SOCKET_PATH "/var/run/pwmctld.sock"


int install_driver(){
    //system("cd /home/hannes/extra/it87 && git pull && make && sudo make install &&  cd /lib/modules/$(uname -r)/kernel/drivers/hwmon && sudo cp it87.ko it87.ko.zst");
    system("cd /home/hannes/extra/it87 && git pull && make");
    system("sudo make -C /home/hannes/extra/it87 install");
    system("sudo cp /lib/modules/$(uname -r)/kernel/drivers/hwmon/it87.ko /lib/modules/$(uname -r)/kernel/drivers/hwmon/it87.ko.zst");
    
    return 0;
}

nvmlDevice_t nvmlinit(){
    nvmlReturn_t result;
    nvmlDevice_t device;

    result = nvmlInit();
    if (NVML_SUCCESS != result) {
        std::cerr << "NVML Init failed: " << nvmlErrorString(result) << "\n";
        return NULL;
    }

    result = nvmlDeviceGetHandleByIndex(0, &device);
    if (NVML_SUCCESS != result) {
        std::cerr << "Failed to get device handle: " << nvmlErrorString(result) << "\n";
        nvmlShutdown();
        return NULL;
    }
    return device;
}

float nvitemp(nvmlDevice_t device) {
    unsigned int temp;
    if (nvmlDeviceGetTemperature(device, NVML_TEMPERATURE_GPU, &temp) == NVML_SUCCESS)
        return temp;
    return -1;
}

int writefile(std::string path, int a){
    std::ofstream myfile2 (path);
    if(path.find("NONE") != std::string::npos){
        std::cerr<<"ERROR! ERROR NOT LOADED PROPERLY!\n";
        return 1;
    }
    if(myfile2.bad()){
        std::cerr<<"ERROR! EROR NOT LOADED PROPERLY!\n";
        return 1;
    }
    myfile2<<a;
    myfile2.close();

    return 0;
}
int writeall(int a, std::string path){
    //writefile("/sys/class/hwmon/hwmon2/pwm1_enable", a);
    //writefile(path+"pwm1_enable", a);
    writefile(path+"pwm2_enable", a);
    writefile(path+"pwm3_enable", a);
    writefile(path+"pwm4_enable", a);

    return 0;
}

int readfile(std::string path ){
    std::ifstream myfile;
    myfile.open(path);
    std::string a="";
    
    std::getline (myfile, a);
    myfile.close();
    if(a.length()==0){
        return -1;
    }
    return (stoi(a));
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

std::string searchpath(const std::string name1, const std::string name2 = ""){
    for (const auto& entry : std::filesystem::directory_iterator("/sys/class/hwmon")) {
        std::ifstream name_file(entry.path() / "name");
         if (name_file) {
                std::string cont;
                std::getline(name_file, cont);
                if (cont.find(name1) != std::string::npos || (name2 != "" &&cont.find(name2) != std::string::npos)) {
                    return entry.path().string()+"/";
                }
         }

    }
    return "NONE";
}

int setnvtemp(int pwm){
    //MAX 62
    static int lastpwm=1;
    if(!lastpwm && !pwm){
        return 0;
    }
    if(pwm==0&&lastpwm!=0){
        //system("sudo -E nvidia-settings -a '[gpu:0]/GPUFanControlState=0'");
        system("nvidia-settings --display=:1 -a '[gpu:0]/GPUFanControlState=0'");
        lastpwm=pwm;
        return 0;
    }
    if(lastpwm==0&&pwm!=0){
        //std::cout<<lastpwm<<std::endl;
        system("nvidia-settings --display=:1 -a '[gpu:0]/GPUFanControlState=1'");
        lastpwm=pwm;
        return 0;
    }

    //system(("nvidia-settings --display=:1 -a '[fan:0]/GPUTargetFanSpeed="+std::to_string(((pwm>=45)?45:31))+"' 2>/dev/null").c_str());
    system(("nvidia-settings --display=:1 -a '[fan]/GPUTargetFanSpeed="+std::to_string(int((pwm)))+"' 2>/dev/null").c_str());
    lastpwm=pwm;

    return 0;
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

bool send_pwm_command(const std::string& path, int value) {
    int sock = socket(AF_UNIX, SOCK_STREAM, 0);
    if (sock < 0) {
        perror("socket");
        return false;
    }

    sockaddr_un addr{};
    addr.sun_family = AF_UNIX;
    strcpy(addr.sun_path, SOCKET_PATH);

    if (connect(sock, (sockaddr*)&addr, sizeof(addr)) == -1) {
        perror("connect");
        close(sock);
        return false;
    }

    std::string cmd = "set " + path + " " + std::to_string(value);
    if (write(sock, cmd.c_str(), cmd.size()) < 0) {
        perror("write");
        close(sock);
        return false;
    }

    close(sock);
    return true;
}

int setpwm(nlohmann::json& type,nlohmann::json& curves, std::string num,std::string path, int gpu,int GPUTEMP, int CPUTEMP){
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
    if(gpu==1){
        setnvtemp(pwm);
        return 0;
    }else if(gpu==2){
        std::cout<<path + (std::string)type[num]["Name"]<<std::endl<<pwm<<std::endl;
        writefile(path,pwm); //soll bei nicht gpus: path.string()+"_pwm"+std::to_string(num). 
        return 0;
    }
    //std::cout<<path.string() + (std::string)type[num]["Name"]<<std::endl<<pwm<<std::endl;
    std::cout<<path+"pwm"+(num)<<std::endl<<pwm<<std::endl;
    writefile(path+"pwm"+(num),pwm); //soll bei nicht gpus: path.string()+"_pwm"+std::to_string(num). 
    return 0;
}