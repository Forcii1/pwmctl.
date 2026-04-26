#pragma once
#include <filesystem>
#include <fstream>
#include <string>

inline std::string searchpath(const std::string& name1, const std::string& name2 = "") {
    for (const auto& entry : std::filesystem::directory_iterator("/sys/class/hwmon")) {
        std::ifstream name_file(entry.path() / "name");
        if (name_file) {
            std::string cont;
            std::getline(name_file, cont);
            if (cont.find(name1) != std::string::npos ||
               (!name2.empty() && cont.find(name2) != std::string::npos)) {
                return entry.path().string() + "/";
            }
        }
    }
    return "NONE";
}

inline int readfile(std::string path ){
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

