
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


#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <cstdlib>
#include <cctype>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <grp.h>
#include <cstring>
#include <filesystem>

#define SOCKET_PATH "/var/run/pwmctld.sock"

class NvidiaController {
    public:
        bool init() {
    #ifdef HAVE_NVIDIA
            nvmlReturn_t result = nvmlInit();

            if (result != NVML_SUCCESS) {
                std::cerr << "NVML Init failed: " << nvmlErrorString(result) << "\n";
                nvml_ready = false;
                return false;
            }

            result = nvmlDeviceGetHandleByIndex(0, &device);

            if (result != NVML_SUCCESS) {
                std::cerr << "Failed to get NVIDIA device handle: "
                        << nvmlErrorString(result) << "\n";
                nvmlShutdown();
                nvml_ready = false;
                return false;
            }

            nvml_ready = true;
            return true;
    #else
            nvml_ready = false;
            return false;
    #endif
        }

        void shutdown() {
    #ifdef HAVE_NVIDIA
            if (nvml_ready) {
                nvmlShutdown();
                nvml_ready = false;
            }
    #endif
        }

        bool handle(const std::string& cmd) {
            if (cmd.rfind("SET NVIDIA FAN ", 0) == 0) {
                return handle_fan(cmd);
            }

            if (cmd.rfind("SET NVIDIA STATE ", 0) == 0) {
                return handle_state(cmd);
            }

            std::cerr << "Unknown NVIDIA command: " << cmd << "\n";
            return false;
        }

        bool ready() const {
            return nvml_ready;
        }

    private:
    #ifdef HAVE_NVIDIA
        nvmlDevice_t device{};
    #endif

        bool nvml_ready = false;
        std::string display = std::getenv("DISPLAY") ? std::getenv("DISPLAY") : ":0";

        bool handle_fan(const std::string& cmd) {
            std::istringstream iss(cmd);

            std::string set;
            std::string vendor;
            std::string fan_str;
            int fan_id = 0;
            int percent = 0;

            if (!(iss >> set >> vendor >> fan_str >> fan_id >> percent)) {
                std::cerr << "Invalid NVIDIA FAN command\n";
                return false;
            }

            if (fan_id < 0) {
                std::cerr << "Invalid NVIDIA fan id\n";
                return false;
            }

            if (percent < 0 || percent > 100) {
                std::cerr << "Invalid NVIDIA fan value. Allowed: 0-100\n";
                return false;
            }

    #ifdef HAVE_NVIDIA
            if (nvml_ready) {
                nvmlReturn_t result = nvmlDeviceSetFanSpeed_v2(
                    device,
                    static_cast<unsigned int>(fan_id),
                    static_cast<unsigned int>(percent)
                );

                if (result == NVML_SUCCESS) {
                    return true;
                }

                std::cerr << "NVML SetFanSpeed failed: "
                        << nvmlErrorString(result)
                        << ", trying nvidia-settings fallback\n";
            }
    #endif

            return set_fan_with_nvidia_settings(fan_id, percent);
        }

        bool handle_state(const std::string& cmd) {
            std::istringstream iss(cmd);

            std::string set;
            std::string vendor;
            std::string state;
            int fan_id = 0;
            int value = 0;

            // Erwartet: SET NVIDIA STATE <fan_id> <value>
            // value 0 = Auto/default
            // value 1 = manuell
            if (!(iss >> set >> vendor >> state >> fan_id >> value)) {
                std::cerr << "Invalid NVIDIA STATE command\n";
                return false;
            }

            if (fan_id < 0) {
                std::cerr << "Invalid NVIDIA fan id\n";
                return false;
            }

            if (value == 0) {
    #ifdef HAVE_NVIDIA
                if (nvml_ready) {
                    nvmlReturn_t result = nvmlDeviceSetDefaultFanSpeed_v2(
                        device,
                        static_cast<unsigned int>(fan_id)
                    );

                    if (result == NVML_SUCCESS) {
                        std::cerr << "NVIDIA fan " << fan_id << " set to default\n";
                        return true;
                    }

                    std::cerr << "NVML SetDefaultFanSpeed failed: "
                            << nvmlErrorString(result)
                            << ", trying nvidia-settings fallback\n";
                }
    #endif

                return set_auto_with_nvidia_settings();
            }

            if (value == 1) {
                return set_manual_with_nvidia_settings();
            }

            std::cerr << "Invalid NVIDIA STATE value. Allowed: 0 or 1\n";
            return false;
        }

        bool set_fan_with_nvidia_settings(int fan_id, int percent) {
            if (percent < 30 || percent > 100) {
                std::cerr << "nvidia-settings fan value must be 30-100\n";
                return false;
            }

            std::string nvcmd =
                "nvidia-settings --display=" + display +
                " -a \"[gpu:0]/GPUFanControlState=1\""
                " -a \"[fan:" + std::to_string(fan_id) +
                "]/GPUTargetFanSpeed=" + std::to_string(percent) +
                "\" > /dev/null 2>&1";

            return std::system(nvcmd.c_str()) == 0;
        }

        bool set_auto_with_nvidia_settings() {
            std::string nvcmd =
                "nvidia-settings --display=" + display +
                " -a \"[gpu:0]/GPUFanControlState=0\" > /dev/null 2>&1";

            return std::system(nvcmd.c_str()) == 0;
        }

        bool set_manual_with_nvidia_settings() {
            std::string nvcmd =
                "nvidia-settings --display=" + display +
                " -a \"[gpu:0]/GPUFanControlState=1\" > /dev/null 2>&1";

            return std::system(nvcmd.c_str()) == 0;
        }
};


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

int amd_setzerorpmmode(int mode,std::string path ,std::string cmd){
    std::string zrpm_path = path.substr(0, path.find_last_of('/')) + "/fan_zero_rpm_enable";
    std::cout << "DEBUG zrpm_path = [" << zrpm_path << "]\n";
    std::ofstream zfile(zrpm_path);
    if (!zfile) {
        std::cerr << "Konnte " << zrpm_path << " nicht öffnen\n";
        return 1;
    } else {
        zfile << mode; 
        zfile.flush();
        zfile.close();
    }
    return 0;
}

bool set_amd_pwm(std::string cmd){
    if (cmd.rfind("AMDPWM", 0) != 0) {
        std::cerr << "Ungültiges Kommando.\n";
        return 1;
    }

    size_t p1 = cmd.find(':');
    size_t p2 = cmd.find(':', p1 + 1);
    size_t p3 = cmd.find(':', p2 + 1);
    


    std::string path = cmd.substr(p1+1, p2-p1-1);
    std::string length = cmd.substr(p2+1,p3-p2-1);

    size_t prpm = cmd.find_last_not_of(':');
    char zrpm_c = cmd.substr(prpm)[0];
    int zrpm = zrpm_c - '0';

    amd_setzerorpmmode(zrpm,path,cmd);

    std::ofstream file(path);
    if (!file) {
        std::cerr << "Fehler beim Schreiben in " << path << "\n";
        return 1;
    } 
    std::cout<<cmd<<std::endl;    
    cmd=cmd.substr(p3+1,cmd.length());



    
    for(int i=0;i<std::stoi(length);i++){
        size_t p1 = cmd.find(':');
        size_t p2 = cmd.find(':', p1 + 1);
        std::string pwm  = cmd.substr(0, p1);
        std::string temp = cmd.substr(p1+1, p2-p1-1);
        
        file << (std::to_string(i)+" "+temp+" "+pwm);
        file.flush();                     
        if (!file) {
            std::cout << "Fehler beim Schreiben von Punkt " << i << "\n";
            return true;
        }

        cmd = cmd.substr(p2+1, cmd.length());
    }

    file << "c";
    file.flush();
    
    if (!file) {
        std::cout << "Fehler beim Schreiben in " << path << "\n";
        return true;
    }

    return 0;
    
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

    struct group* grp = getgrnam("pwm");
    if (grp) {
        chown(SOCKET_PATH, 0, grp->gr_gid);
        chmod(SOCKET_PATH, 0660);
    } else {
        chmod(SOCKET_PATH, 0666);
    }

    std::cerr << "pwmctld socket runs: " << SOCKET_PATH << "\n";

    NvidiaController nvidia;
    if (nvidia.init()) {
        std::cerr << "NvidiaGPU found!\n";
    }

    std::cerr << "Daemon ready!\n";

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

            if (cmd.rfind("SET NVIDIA ", 0) == 0) {
                nvidia.handle(cmd);
            }
            else if (cmd.rfind("SET ", 0) == 0) {
                set_pwm(cmd);
            }
            else if (cmd.rfind("AMDPWM", 0) == 0) {
                set_amd_pwm(cmd);
            }
        }
        close(client);
    }

    nvidia.shutdown();
}