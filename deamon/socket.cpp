#include <cstdarg>
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


bool is_path_allowed(const std::string& path) {
    std::filesystem::path p(path);
    std::string fname = p.filename().string();
    std::string dir   = p.parent_path().string();

    // Muss innerhalb /sys/class/hwmon liegen
    if (dir.rfind("/sys/class/hwmon/hwmon", 0) != 0)
        return false;

    // Prüfen, ob Dateiname pwmX oder pwmX_enable
    if (fname.rfind("pwm", 0) != 0) return false;
    size_t i = 3;
    while (i < fname.size() && isdigit(fname[i])) i++;
    if (i == fname.size()) return true;
    if (fname.substr(i) == "_enable") return true;

    return false;
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

    std::cout << "pwmctld läuft. Socket: " << SOCKET_PATH << "\n";

    while (true) {
        int client = accept(server, nullptr, nullptr);
        if (client < 0) continue;

        char buf[256];
        int len = read(client, buf, sizeof(buf) - 1);
        if (len <= 0) { close(client); continue; }

        buf[len] = '\0';
        std::string cmd(buf);

        // -------------------------------
        // NVIDIA FAN CONTROL
        // -------------------------------
        // Syntax: NVIDIA FAN 30
        if (cmd.rfind("NVIDIA FAN ", 0) == 0) {
            std::string value = cmd.substr(11);

            int speed = std::stoi(value);
            if (speed < 30 || speed > 100) {
                std::cerr << "Ungültiger FAN-Wert.\n";
                close(client);
                continue;
            }

        std::string nvcmd =
            "nvidia-settings --display=:1 -a \"[fan]/GPUTargetFanSpeed=" +
            std::to_string(speed) + "\" > /dev/null 2>&1";

            system(nvcmd.c_str());
            //std::cout << "NVIDIA Fan → " << speed << "%\n";

            close(client);
            continue;
        }
        if (cmd.rfind("NVIDIA STATE ", 0) == 0) {
            std::string value = cmd.substr(12);
            std::string nvcmd =
                "nvidia-settings --display=:1 -a \"[gpu]/GPUFanControlState=" +
                value+ "\" > /dev/null 2>&1";

            system(nvcmd.c_str());
            //std::cout << "NVIDIA State → " << value << "%\n";

            close(client);
            continue;
        }

        // -------------------------------
        // SET path value
        // -------------------------------
        if (cmd.rfind("SET ", 0) != 0) {
            std::cerr << "Ungültiges Kommando.\n";
            close(client);
            continue;
        }

        size_t p1 = cmd.find(' ');
        size_t p2 = cmd.find(' ', p1 + 1);
        if (p1 == std::string::npos || p2 == std::string::npos) {
            std::cerr << "Ungültiges Kommando.\n";
            close(client);
            continue;
        }

        std::string path  = cmd.substr(p1 + 1, p2 - p1 - 1);
        std::string value = cmd.substr(p2 + 1);

        // Pfad validieren
        if (!is_path_allowed(path)) {
            std::cerr << "Pfad verboten: " << path << "\n";
            close(client);
            continue;
        }

        std::ofstream file(path);
        if (!file) {
            std::cerr << "Fehler beim Schreiben in " << path << "\n";
        } else {
            file << value;
            //std::cout << "Set " << path << " to " << value << "\n";
        }

        close(client);
    }
}
