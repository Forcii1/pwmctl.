#include <iostream>
#include <nvidia/nvml.h>

int main(){
    nvmlReturn_t result;
    nvmlDevice_t device;

    result = nvmlInit();
    if (NVML_SUCCESS != result) {
        return 1; // Fehler
    }

    result = nvmlDeviceGetHandleByIndex(0, &device);
    if (NVML_SUCCESS != result) {
        nvmlShutdown();
        return 1; // Fehler
    }

    unsigned int fan = 0;
    if (nvmlDeviceGetFanSpeed(device, &fan) == NVML_SUCCESS){
        std::cout << fan << std::endl; // Hier gibst du den Prozentwert aus
    } else {
        std::cout << 0 << std::endl; // Default, falls Abfrage fehlschlägt
    }

    nvmlShutdown();
    return 0; // 0 = Erfolg
}