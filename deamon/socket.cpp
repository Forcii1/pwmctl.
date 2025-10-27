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

#define SOCKET_PATH "/var/run/pwmctld.sock"

int main() {
    unlink(SOCKET_PATH);
    int server = socket(AF_UNIX, SOCK_STREAM, 0);
    sockaddr_un addr{};
    addr.sun_family = AF_UNIX;
    strcpy(addr.sun_path, SOCKET_PATH);
    bind(server, (sockaddr*)&addr, sizeof(addr));
    listen(server, 5);

    // Set permissions & group
    struct group* grp = getgrnam("pwm");
    if (grp != nullptr) {
        chown(SOCKET_PATH, 0, grp->gr_gid); // root:pwm
        chmod(SOCKET_PATH, 0660);           // root & group only
    } else {
        std::cerr << "Warnung: Gruppe 'pwm' nicht gefunden!\n";
        chmod(SOCKET_PATH, 0666);           // Fallback
    }

    std::cout << "pwmctld läuft. Socket: " << SOCKET_PATH << std::endl;

    while (true) {
        int client = accept(server, nullptr, nullptr);
        char buf[256];
        int len = read(client, buf, sizeof(buf)-1);
        if (len > 0) {
            buf[len] = '\0';
            std::string cmd(buf);
            auto path = cmd.substr(4, cmd.find(' ', 4) - 4);
            auto value = cmd.substr(cmd.find_last_of(' ') + 1);
            std::ofstream file(path);
            file << value;
            std::cout << "Set " << path << " to " << value << std::endl;
        }
        close(client);
    }
}
