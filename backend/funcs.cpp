
#include <filesystem>
#include <fstream>
#include <string>
#include <iostream>

#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

#include <nvidia/nvml.h>
#include "json.hpp"
#include "socket/socket_utils.hpp"

using json = nlohmann::json;



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

int getpwm(nlohmann::json& type,nlohmann::json& curves, std::string num,int GPUTEMP, int CPUTEMP){
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
    else if (!type[num]["enabled"] && stoi(curve) <= 0) {
        return -1;  // Nicht senden
    }
    return pwm;
}

bool setpwm(int pwm,std::string path,std::string num){
    if(pwm==-1){
        send_command(path+"pwm"+num+"_enable", 2);
        return 1;
    }else if (pwm>=0 && pwm <=255) {
        send_command(path+"pwm"+num+"_enable", 1);
        send_command(path+"pwm"+(num), pwm);
        return 1;
    }
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
