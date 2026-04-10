#include "../nvml.h"
#include <iostream>
#include <fstream>
#include <string>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <grp.h>
#include <cstring>
#include <limits.h>
#include <filesystem>

#define SOCKET_PATH "/var/run/pwmctld.sock"

nvmlDevice_t nvdevice;
std::string display = getenv("DISPLAY") ? getenv("DISPLAY") : ":0";

bool is_path_allowed(const std::string& path) {
    std::filesystem::path p(path);
    std::string fname = p.filename().string();
    std::string dir   = p.parent_path().string();

    if (dir.rfind("/sys/class/hwmon/hwmon", 0) != 0)
        return false;

    if (fname.rfind("pwm", 0) != 0) return false;
    size_t i = 3;
    while (i < fname.size() && isdigit(fname[i])) i++;
    if (i == fname.size()) return true;
    if (fname.substr(i) == "_enable") return true;

    return false;
}


bool set_pwm(std::string cmd){
    if (cmd.rfind("SET ", 0) != 0) {
        std::cerr << "Ungültiges Kommando.\n";
        return 1;
    }

    size_t p1 = cmd.find(' ');
    size_t p2 = cmd.find(' ', p1 + 1);
    if (p1 == std::string::npos || p2 == std::string::npos) {
        std::cerr << "Ungültiges Kommando.\n";
        return 1;
    }

    std::string path  = cmd.substr(p1 + 1, p2 - p1 - 1);
    std::string value = cmd.substr(p2 + 1);

    // Pfad validieren
    if (!is_path_allowed(path)) {
        std::cerr << "Pfad verboten: " << path << "\n";
        return 1;
    }

    std::ofstream file(path);
    if (!file) {
        std::cerr << "Fehler beim Schreiben in " << path << "\n";
        return 1;
    } 
    
    file << value;
    if (!file) {
        std::cerr << "Fehler beim Schreiben in " << path << "\n";
        return true;
    }

    return 0;
    
}



bool set_nvidia(std::string cmd){

    if (cmd.rfind("SET NVIDIA FAN ", 0) == 0) {
        std::string value = cmd.substr(15);
        int speed;
        try {
            speed = std::stoi(value);
        } catch (std::invalid_argument& e) {
            std::cerr << "Ungültige Zahl\n";
            return false;
        }

        if (speed < 30 || speed > 100) {
            std::cerr << "Ungültiger FAN-Wert.\n";
            return 1;
        }

        std::string nvcmd =
            "nvidia-settings --display="+display+" -a \"[fan:0]/GPUTargetFanSpeed="+
            std::to_string(speed) + "\" > /dev/null 2>&1";

            system(nvcmd.c_str());
            return 0;
    }

    if (cmd.rfind("SET NVIDIA STATE ", 0) == 0) {
        std::string value = cmd.substr(17);
        std::string nvcmd =
            "nvidia-settings --display="+display+" -a \"[gpu:0]/GPUFanControlState=" +
            value+ "\" > /dev/null 2>&1";

        system(nvcmd.c_str());
        return 0;
    }
    return 1;
}

bool set_nvidia_nvml(std::string cmd) {
    if (cmd.rfind("SET NVIDIA FAN ", 0) == 0) {
        int percent;
        try {
            percent = stoi(cmd.substr(15));
        } catch (std::invalid_argument& e) {
            std::cerr << "Ungültige Zahl\n";
            return false;
        }

        if (percent < 0 || percent > 100) {
            std::cerr << "Ungültiger Wert (0–100)\n";
            return false;
        }

        nvmlReturn_t result = nvmlDeviceSetFanSpeed_v2(nvdevice, 0, percent);
        if (result != NVML_SUCCESS) {
            std::cerr << "SetFanSpeed failed: " << nvmlErrorString(result) << "\n";
            return false;
        }
        std::cerr<<"Fanspeed set to: "<<percent<<std::endl;
    }

    if (cmd.rfind("SET NVIDIA STATE ", 0) == 0) {
        int value;
        try {
            value = stoi(cmd.substr(17));
        } catch (std::invalid_argument& e) {
            std::cerr << "Ungültige Zahl\n";
            return false;
        }

        if(value==0){
            nvmlDeviceSetDefaultFanSpeed_v2(nvdevice, 0);
        }
        return 0;
    }
    return true;
}

bool nvml_init(){
    nvmlReturn_t result;
    nvmlDevice_t device;

    result = nvmlInit();
    if (NVML_SUCCESS != result) {
        std::cerr << "NVML Init failed: " << nvmlErrorString(result) << "\n";
        return false;
    }

    result = nvmlDeviceGetHandleByIndex(0, &device);
    if (NVML_SUCCESS != result) {
        std::cerr << "Failed to get device handle: " << nvmlErrorString(result) << "\n";
        nvmlShutdown();
        return false;
    }
    nvdevice=device;
    return true;
}

void cleanupNVML() {
    nvmlShutdown();
}

int main() {
    unlink(SOCKET_PATH);

    int server = socket(AF_UNIX, SOCK_STREAM, 0);
    if (server < 0) { perror("socket"); return 1; }

    sockaddr_un addr{};
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, SOCKET_PATH, sizeof(addr.sun_path)-1);

    if (bind(server, (sockaddr*)&addr, sizeof(addr)) < 0) {
        perror("bind");
        return 1;
    }

    if (listen(server, 5) < 0) {
        perror("listen");
        return 1;
    }

    // Rechte setzen
    struct group* grp = getgrnam("pwm");
    if (grp) {
        chown(SOCKET_PATH, 0, grp->gr_gid);
        chmod(SOCKET_PATH, 0660);
    } else {
        chmod(SOCKET_PATH, 0666);
    }

    std::cerr << "pwmctld socket runs: " << SOCKET_PATH << "\n";
    
    bool nvready=false;
    if(nvml_init()) {
        nvready=true;
        std::cerr<<"NvidiaGPU found!\n";
    }
    
    std::cerr<<"Daemon ready!\n";

    while (true) {
        int client = accept(server, nullptr, nullptr);
        if (client < 0) continue;

        std::string buffer;
        char chunk[256];
        ssize_t n;

        while ((n = read(client, chunk, sizeof(chunk))) > 0) {
            buffer.append(chunk, n);
        }

        if (n < 0) {
            perror("read");
            close(client);
            continue;
        }

        size_t pos;
        while ((pos = buffer.find('\n')) != std::string::npos) {
            std::string cmd = buffer.substr(0, pos);
            buffer.erase(0, pos + 1);
            if (cmd.empty()) continue;


            if(cmd.rfind("SET NVIDIA ", 0) == 0){
                if(nvready){
                    if(!set_nvidia_nvml(cmd)){
                        set_nvidia(cmd);
                    }
                } else{
                    set_nvidia(cmd);
                }
            }
            else if(cmd.rfind("SET ", 0) == 0){
                set_pwm(cmd);
            }
            
        }
        close(client);
    }
    cleanupNVML();
}
