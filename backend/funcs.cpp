
#include <filesystem>
#include <fstream>
#include <string>
#include <iostream>

#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

#include <nvidia/nvml.h>
#include "json.hpp"

using json = nlohmann::json;
#define SOCKET_PATH "/var/run/pwmctld.sock"

int sock=0;

int fallback(const char* cmd) {
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

int nvitemp(nvmlDevice_t device) {
    int temp = -1;
    unsigned int t;
    nvmlReturn_t result = nvmlDeviceGetTemperature(device, NVML_TEMPERATURE_GPU, &t);

    if (result == NVML_SUCCESS) {
        temp = t;
    } else {
        std::cerr << "Temp error: " << nvmlErrorString(result) << "\n";
        temp = fallback("nvidia-settings --display= -q GPUCoreTemp -t 2>/dev/null");
    }
    return temp;
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

bool send_command(const std::string& path, int value) {

    std::string cmd;

    if (path == "NVIDIA") {
    //    std::cout<<path<<std::endl;
        // NVIDIA-FAN
        if (value < 30 || value > 100) {
            std::cerr << "Ungültiger NVIDIA-FAN-Wert: " << value << "\n";
            return false;
        }
        cmd = "SET NVIDIA FAN " + std::to_string(value);
    } else if (path == "NVIDIASTATE") {
       
        cmd = "SET NVIDIA STATE " + std::to_string(value);
    }else {
        // Mainboard-PWM
        cmd = "SET " + path + " " + std::to_string(value);
    }
    initsock();
    cmd += "\n";
    ssize_t total_sent = 0;
    ssize_t len = cmd.size();
    const char* data = cmd.c_str();
    while (total_sent < len) {
        ssize_t n = write(sock, data + total_sent, len - total_sent);
        if (n <= 0) {
            perror("write");
            closesock();
            return false;
        }
        total_sent += n;
    }
    closesock();
    return true;
}

int setnvtemp(int pwm){
    static int lastpwm=1;
    if(lastpwm<=30 && pwm<=30){
        return 0;
    }
    else if(pwm<30&&lastpwm>=30){
        send_command("NVIDIASTATE",0);
        lastpwm=pwm;
        return 0;
    }
    else if(lastpwm<30&&pwm>=30){
        send_command("NVIDIASTATE",1);
        lastpwm=pwm;
        return 0;
    }
    send_command("NVIDIA", pwm);
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
                pwm = calcpwm(temps, pwms, GPUTEMP, temps_vec.size());
                break;
            case 2:
                pwm = calcpwm(temps, pwms, CPUTEMP>GPUTEMP ? CPUTEMP : GPUTEMP, temps_vec.size());
                break;
        }
    }
    if(gpu==1){//nvidia
        setnvtemp(int(pwm/2.55));
        //send_command("NVIDIA", int(pwm/2.55));
        return 0;
    }else if(gpu==2){   //amd
        send_command(path, pwm);
        return 0;
    }
    if (!type[num]["enabled"] && stoi(curve) <= 0) {
        send_command(path+"pwm"+num+"_enable", 2);
        return -1;  // Nicht senden
    }

    send_command(path+"pwm"+num+"_enable", 1);
    send_command(path+"pwm"+(num), pwm);
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

int get_nvidia_fan(nvmlDevice_t device){
    int fan = -1;
    unsigned int f;
    nvmlReturn_t result = nvmlDeviceGetFanSpeed(device, &f);

    if (result == NVML_SUCCESS) {
        fan = f;
    } else {
        std::cerr << "Fan error: " << nvmlErrorString(result) << "\n";
        fan = fallback("nvidia-settings --display= -q [fan:0]/GPUCurrentFanSpeed -t 2>/dev/null");       
    }

    return fan;
}