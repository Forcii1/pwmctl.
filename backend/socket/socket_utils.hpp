#pragma once
#include <string>

/*class SocketClient {
public:
    bool send_command(const std::string& path, int value);
private:
    bool init();
    void closesock();
    int sock = -1;
    const std::string SOCKET_PATH= "/var/run/pwmctld.sock";
};*/
bool send_command(const std::string& path, int value);
int init();
void closesock();