#include "gpu_nvidia_nvapi.hpp"


constexpr uint32_t NVAPI_INITIALIZE_ID = 0x0150E828;
constexpr uint32_t NVAPI_ENUM_PHYSICAL_GPUS_ID = 0xE5AC921F;
constexpr uint32_t NVAPI_GPU_GET_VOLTAGE_ID = 0x465F9BCF;
constexpr uint32_t NVAPI_GPU_GET_THERMALS_ID = 0x65FE3AAD;

constexpr int SENSOR_HOTSPOT = 1;
constexpr int SENSOR_VRAM = 7;

struct NvApiVoltage {
    uint32_t version;
    uint32_t flags;
    uint32_t padding_1[8];
    uint32_t value_uv;
    uint32_t padding_2[8];
};

struct NvApiThermals {
    uint32_t version;
    int32_t mask;
    int32_t values[40];
};

bool NvidiaNvApi::init() {
    lib = dlopen("libnvidia-api.so.1", RTLD_LAZY);
    if (!lib) {
        std::cerr << "NvAPI dlopen failed: " << dlerror() << "\n";
        return false;
    }

    auto query = reinterpret_cast<NvAPI_QueryInterface_t>(
        dlsym(lib, "nvapi_QueryInterface")
    );

    if (!query) {
        std::cerr << "nvapi_QueryInterface not found\n";
        shutdown();
        return false;
    }

    auto initialize = reinterpret_cast<NvAPI_Initialize_t>(
        query(NVAPI_INITIALIZE_ID)
    );

    auto enum_gpus = reinterpret_cast<NvAPI_EnumPhysicalGPUs_t>(
        query(NVAPI_ENUM_PHYSICAL_GPUS_ID)
    );

    get_voltage = reinterpret_cast<NvAPI_GetVoltage_t>(
        query(NVAPI_GPU_GET_VOLTAGE_ID)
    );

    get_thermals = reinterpret_cast<NvAPI_GetThermals_t>(
        query(NVAPI_GPU_GET_THERMALS_ID)
    );

    if (!initialize || !enum_gpus) {
        std::cerr << "Required NvAPI functions missing\n";
        shutdown();
        return false;
    }

    if (initialize() != 0) {
        std::cerr << "NvAPI initialize failed\n";
        shutdown();
        return false;
    }

    void* handles[64] = {};
    int count = 0;

    if (enum_gpus(handles, &count) != 0 || count <= 0) {
        std::cerr << "NvAPI enum GPUs failed\n";
        shutdown();
        return false;
    }

    gpu_handle = handles[0];
    return true;
}

double NvidiaNvApi::read_temp(int sensor_id) {
    if (!get_thermals || !gpu_handle) {
        return -1.0;
    }

    NvApiThermals thermals {};
    thermals.version = sizeof(NvApiThermals) | (2 << 16);
    thermals.mask = 1 << sensor_id;

    if (get_thermals(gpu_handle, &thermals) != 0) {
        return -1.0;
    }

    int index = 8 + sensor_id;

    if (index < 0 || index >= 40) {
        return -1.0;
    }

    int raw = thermals.values[index];

    if (raw == 0) {
        return -1.0;
    }

    return raw / 256.0;
}

NvidiaNvApiStats NvidiaNvApi::read_stats() {
    NvidiaNvApiStats stats {};
    stats.available = gpu_handle != nullptr;

    if (!stats.available) {
        return stats;
    }

    if (get_voltage) {
        NvApiVoltage voltage {};
        voltage.version = sizeof(NvApiVoltage) | (1 << 16);

        if (get_voltage(gpu_handle, &voltage) == 0 && voltage.value_uv != 0) {
            stats.voltage_available = true;
            stats.voltage_mv = voltage.value_uv / 1000.0;
        }
    }

    if (get_thermals) {
        double hotspot = read_temp(SENSOR_HOTSPOT);
        double vram = read_temp(SENSOR_VRAM);

        if (hotspot >= 0) {
            stats.hotspot_available = true;
            stats.hotspot_temp = hotspot;
        }

        if (vram >= 0) {
            stats.vram_available = true;
            stats.vram_temp = vram;
        }
    }

    return stats;
}

void NvidiaNvApi::shutdown() {
    if (lib) {
        dlclose(lib);
        lib = nullptr;
    }

    gpu_handle = nullptr;
    get_voltage = nullptr;
    get_thermals = nullptr;
}