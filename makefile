CXX          := g++
CXXFLAGS     := -g -Wall -std=c++20
TARGET       := pwmctl
SOCKET       := pwmctld

INSTALL_DIR  := /usr/local/bin
SOCKET_DIR   := /var/run
GROUP        := pwm
FRONTEND_DIR := frontend

# ==== NVIDIA AUTO-DETECTION ====
NVML_HEADER := $(wildcard /usr/include/nvidia/nvml.h /usr/include/nvml.h)
NVML_LIB    := $(shell ldconfig -p 2>/dev/null | grep -q 'libnvidia-ml.so' && echo yes)

HAVE_NVIDIA := 0

ifneq ($(NVML_HEADER),)
ifeq ($(NVML_LIB),yes)
	HAVE_NVIDIA := 1
endif
endif

# ==== SOURCES ====
SRC_BACKEND  := \
	backend/main.cpp \
	backend/socket/socket_utils.cpp \
	backend/gpu/gpu_amd.cpp

SRC_SOCKET   := daemon/socket.cpp

BACKEND_LIBS :=
SOCKET_LIBS  :=

ifeq ($(HAVE_NVIDIA),1)
	SRC_BACKEND += \
		backend/gpu/gpu_nvidia.cpp \
		backend/gpu/gpu_nvidia_nvapi.cpp

	CXXFLAGS += -DHAVE_NVIDIA
	BACKEND_LIBS += -lnvidia-ml -ldl
	SOCKET_LIBS += -lnvidia-ml -ldl
endif

# ==== BUILD RULES ====
all: $(TARGET) $(SOCKET)

# Backend
$(TARGET): $(SRC_BACKEND)
	@echo "Kompiliere Backend..."
	@echo "NVIDIA support: $(if $(filter 1,$(HAVE_NVIDIA)),yes,no)"
	@$(CXX) $(CXXFLAGS) $(SRC_BACKEND) -o $(TARGET) $(BACKEND_LIBS)

# Socket-Server
$(SOCKET): $(SRC_SOCKET)
	@echo "Kompiliere Socket-Server..."
	@$(CXX) $(CXXFLAGS) $(SRC_SOCKET) -o $(SOCKET) $(SOCKET_LIBS)

# ==== INSTALLATION ====
install: all install-socket install-client install-frontend
	@rm -f pwmctl
	@rm -f pwmctld
	@echo "Installation abgeschlossen."

# Socket-Service installieren
install-socket:
	@echo "Installiere Socket-Server..."
	@install -d $(INSTALL_DIR)
	@install -m 755 $(SOCKET) $(INSTALL_DIR)/$(SOCKET)
	@if ! getent group $(GROUP) > /dev/null; then \
		groupadd $(GROUP); \
	fi
	@install -d -m 775 -o root -g $(GROUP) $(SOCKET_DIR)
	@cp pwmctld.service /etc/systemd/system/
	@systemctl daemon-reload
	@systemctl enable pwmctld.service
	@systemctl restart pwmctld.service
	@echo "Socket-Server läuft als Root."

# Client installieren
install-client:
	@if [ -z "$$SUDO_USER" ]; then \
		echo "SUDO_USER nicht gesetzt. Bitte 'sudo make install' verwenden."; exit 1; \
	fi
	@echo "Installiere Client..."
	@install -m 755 $(TARGET) $(INSTALL_DIR)/pwmctl-backend
	@usermod -aG $(GROUP) $$SUDO_USER
	@install -m 755 pwmctl.sh $(INSTALL_DIR)/pwmctl
	@echo "Client installiert."

# Frontend installieren
install-frontend:
	@if [ -z "$$SUDO_USER" ]; then \
		echo "SUDO_USER nicht gesetzt. Bitte 'sudo make install' verwenden."; exit 1; \
	fi
	@echo "Installiere Frontend..."
	@install -d /usr/local/share/pwmctl
	@install -d /usr/local/share/applications
	@install -d /usr/share/icons/hicolor/128x128/apps
	@install -d /home/$$SUDO_USER/.config/autostart
	@cp -r $(FRONTEND_DIR)/ /usr/local/share/pwmctl/
	@magick $(FRONTEND_DIR)/assets/icon.png -resize 128x128 /tmp/pwmctl_icon.png
	@install -Dm644 /tmp/pwmctl_icon.png \
		/usr/share/icons/hicolor/128x128/apps/pwmctl.png
	@gtk-update-icon-cache /usr/share/icons/hicolor/ 2>/dev/null || true
	@install -Dm644 pwmctl.desktop \
		/usr/local/share/applications/pwmctl.desktop
	@install -Dm644 pwmctl-autostart.desktop \
		/home/$$SUDO_USER/.config/autostart/pwmctl.desktop
	@chown $$SUDO_USER:$$SUDO_USER \
		/home/$$SUDO_USER/.config/autostart/pwmctl.desktop
	@update-desktop-database /usr/local/share/applications 2>/dev/null || true
	@echo "Frontend installiert."

uninstall:
	@echo "Deinstalliere..."

	# --- Autostart entfernen ---
	@if [ -n "$$SUDO_USER" ]; then \
		rm -f /home/$$SUDO_USER/.config/autostart/pwmctl.desktop; \
	fi

	# --- User Desktop Entry entfernen ---
	@if [ -n "$$SUDO_USER" ]; then \
		rm -f /home/$$SUDO_USER/.local/share/applications/pwmctl.desktop; \
	fi

	# --- System Desktop Entry entfernen ---
	@rm -f /usr/local/share/applications/pwmctl.desktop

	# --- systemd Service stoppen und entfernen ---
	@systemctl stop pwmctld.service 2>/dev/null || true
	@systemctl disable pwmctld.service 2>/dev/null || true
	@rm -f /etc/systemd/system/pwmctld.service
	@systemctl daemon-reload

	# --- Binaries entfernen ---
	@rm -f $(INSTALL_DIR)/pwmctl-backend
	@rm -f $(INSTALL_DIR)/pwmctl
	@rm -f $(INSTALL_DIR)/$(SOCKET)

	# --- Frontend entfernen ---
	@rm -rf /usr/local/share/pwmctl

	# --- Icons entfernen ---
	@rm -f /usr/share/icons/hicolor/128x128/apps/pwmctl.png
	@gtk-update-icon-cache /usr/share/icons/hicolor/ 2>/dev/null || true

	# --- Socket/Runtime Dateien ---
	@rm -f $(SOCKET_DIR)/pwmctld.sock 2>/dev/null || true

	# --- Config entfernen ---
	@if [ -n "$$SUDO_USER" ]; then \
		rm -f /home/$$SUDO_USER/.config/pwmctl.conf; \
	fi

	# --- Gruppe entfernen ---
	@if getent group $(GROUP) > /dev/null; then \
		groupdel $(GROUP); \
	fi

	# --- Desktop DB aktualisieren ---
	@update-desktop-database /usr/local/share/applications 2>/dev/null || true

	@echo "Deinstallation abgeschlossen."

# ==== RUN / CLEAN ====
run: $(TARGET)
	@./$(TARGET)

clean:
	@rm -f $(TARGET) $(SOCKET)
	@echo "Aufgeräumt."

rebuild: clean all

rebuild-install: clean install