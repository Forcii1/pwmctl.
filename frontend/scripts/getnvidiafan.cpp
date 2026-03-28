#include <iostream>
#include <nvidia/nvml.h>

int main(){
    nvmlReturn_t result;
    nvmlDevice_t device;

    result = nvmlInit();
    if (NVML_SUCCESS != result) {
        return 1; 
    }

    result = nvmlDeviceGetHandleByIndex(0, &device);
    if (NVML_SUCCESS != result) {
        nvmlShutdown();
        return 1; 
    }

    unsigned int fan = 0;
    if (nvmlDeviceGetFanSpeed(device, &fan) == NVML_SUCCESS){
        std::cout << fan << std::endl; // in %
    } else {
        std::cout << 0 << std::endl; // fallback
    }

    nvmlShutdown();
    return 0;
}