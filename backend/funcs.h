
#include <chrono>
#include <filesystem>
#include <fstream>
#include <string>
#include <thread>
#include <iostream>

#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

#include <nvidia/nvml.h>
#include "json.hpp"

using json = nlohmann::json;
#define SOCKET_PATH "/var/run/pwmctld.sock"

int sock=0;

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

bool initsock(){
    sock = socket(AF_UNIX, SOCK_STREAM, 0);
    if (sock < 0) {
        perror("socket");
        return false;
    }

    sockaddr_un addr{};
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, SOCKET_PATH, sizeof(addr.sun_path) - 1);
    addr.sun_path[sizeof(addr.sun_path) - 1] = '\0'; 

    if (connect(sock, (sockaddr*)&addr, sizeof(addr)) == -1) {
        perror("connect");
        close(sock);
        return false;
    }
    return true;
}

bool closesock(){
    close(sock);
    return true;
}

bool send_pwm_command(const std::string& path, int value) {

    std::string cmd;

    if (path == "NVIDIA") {
    //    std::cout<<path<<std::endl;
        // NVIDIA-FAN
        if (value < 30 || value > 100) {
            std::cerr << "Ungültiger NVIDIA-FAN-Wert: " << value << "\n";
            return false;
        }
        cmd = "NVIDIA FAN " + std::to_string(value);
    } else if (path == "NVIDIASTATE") {
       
        cmd = "NVIDIA STATE " + std::to_string(value);
    }else {
        // Mainboard-PWM
        cmd = "SET " + path + " " + std::to_string(value);
    }
    cmd += "\n";
    ssize_t total_sent = 0;
    ssize_t len = cmd.size();
    const char* data = cmd.c_str();

    while (total_sent < len) {
        ssize_t n = write(sock, data + total_sent, len - total_sent);
        if (n <= 0) {
            perror("write");
            return false;
        }
        total_sent += n;
    }
    return true;
}

int setnvtemp(int pwm){
    static int lastpwm=1;
    if(lastpwm<=30 && pwm<=30){
        return 0;
    }
    else if(pwm<30&&lastpwm>=30){
        send_pwm_command("NVIDIASTATE",0);
        lastpwm=pwm;
        return 0;
    }
    else if(lastpwm<30&&pwm>=30){
        send_pwm_command("NVIDIASTATE",1);
        lastpwm=pwm;
        return 0;
    }
    send_pwm_command("NVIDIA", pwm);
    lastpwm=pwm;

    return 0;
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
                //std::cout<<CPUTEMP<<std::endl;
                pwm = calcpwm(temps, pwms, GPUTEMP, temps_vec.size());
                break;
            case 2:
                pwm = calcpwm(temps, pwms, CPUTEMP>GPUTEMP ? CPUTEMP : GPUTEMP, temps_vec.size());
                break;
        }
    }
    if(gpu==1){
        setnvtemp(int(pwm/2.55));
        //send_pwm_command("NVIDIA", int(pwm/2.55));
        return 0;
    }else if(gpu==2){
        send_pwm_command(path, pwm);
        return 0;
    }
    send_pwm_command(path+"pwm"+(num), pwm);
    return 0;
}
int initfancontrol(int a, std::string path){
    int i=2;
    while(true){
        if(!send_pwm_command(path+"pwm"+std::to_string(i)+"_enable", a)) break; 
        i++;
    }
    return 0;
}