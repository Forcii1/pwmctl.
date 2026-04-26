#include <dlfcn.h>
#include <cstdint>
#include <cstring>
#include <iostream>

struct NvidiaNvApiStats {
    bool available = false;

    bool voltage_available = false;
    double voltage_mv = -1.0;

    bool hotspot_available = false;
    double hotspot_temp = -1.0;

    bool vram_available = false;
    double vram_temp = -1.0;
};

class NvidiaNvApi {
public:
    bool init();
    NvidiaNvApiStats read_stats();
    void shutdown();

private:
    double read_temp(int sensor_id);

    void* lib = nullptr;
    void* gpu_handle = nullptr;

    using NvAPI_Status = int;
    using NvAPI_QueryInterface_t = void* (*)(unsigned int);

    using NvAPI_Initialize_t = NvAPI_Status (*)();
    using NvAPI_EnumPhysicalGPUs_t = NvAPI_Status (*)(void** handles, int* count);
    using NvAPI_GetVoltage_t = NvAPI_Status (*)(void* gpu_handle, void* voltage_info);
    using NvAPI_GetThermals_t = NvAPI_Status (*)(void* gpu_handle, void* thermal_info);

    NvAPI_GetVoltage_t get_voltage = nullptr;
    NvAPI_GetThermals_t get_thermals = nullptr;
};
