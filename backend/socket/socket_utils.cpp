#include "socket_utils.hpp"

#include <string>
#include <iostream>

#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
const std::string SOCKET_PATH= "/var/run/pwmctld.sock";


void closesock(int sock){
    close(sock);
}

int init(){
    int sock = socket(AF_UNIX, SOCK_STREAM, 0);
    if (sock < 0) {
        perror("socket");
        return false;
    }

    sockaddr_un addr{};
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, SOCKET_PATH.c_str(), sizeof(addr.sun_path) - 1);
    addr.sun_path[sizeof(addr.sun_path) - 1] = '\0'; 

    if (connect(sock, (sockaddr*)&addr, sizeof(addr)) == -1) {
        perror("connect");
        closesock(sock);
        return false;
    }
    return sock;
}

bool send_command(const std::string& path, int value) {

    std::string cmd;

    if (path == "NVIDIASTATE") {
        cmd = "SET NVIDIA STATE " + std::to_string(value);
    } else if (path.starts_with("NVIDIA")) {
        // NVIDIA-FAN
        if (value < 30 || value > 100) {
            std::cerr << "Ungültiger NVIDIA-FAN-Wert: " << value << "\n";
            return false;
        }
        size_t pos = path.find(' ');
        int fannum= path[pos+1] - '0';
        cmd = "SET NVIDIA FAN "+ std::to_string(fannum)+ " " + std::to_string(value);
    }else {
        // Mainboard-PWM
        cmd = "SET " + path + " " + std::to_string(value);
    }
    int sock=init();
    if(!sock){
        std::cerr << "Socket Connection not possible!\n";
        return 0;
    }


    cmd += "\n";
    ssize_t total_sent = 0;
    ssize_t len = cmd.size();
    const char* data = cmd.c_str();
    while (total_sent < len) {
        ssize_t n = write(sock, data + total_sent, len - total_sent);
        if (n <= 0) {
            perror("write");
            closesock(sock);
            return false;
        }
        total_sent += n;
    }
    closesock(sock);
    return true;
}