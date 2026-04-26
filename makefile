CXX          := g++
CXXFLAGS     := -g -Wall -std=c++20
TARGET       := pwmctl
SOCKET       := pwmctld

SRC_BACKEND  := \
	backend/main.cpp \
	backend/socket/socket_utils.cpp \
	backend/gpu/gpu_amd.cpp \
	backend/gpu/gpu_nvidia.cpp \
	backend/gpu/gpu_nvidia_nvapi.cpp

SRC_SOCKET   := daemon/socket.cpp
LIBS         := -lnvidia-ml -ldl

INSTALL_DIR  := /usr/local/bin
SOCKET_DIR   := /var/run
GROUP        := pwm
FRONTEND_DIR := frontend

# ==== BUILD RULES ====
all: $(TARGET) $(SOCKET)

# Backend
$(TARGET): $(SRC_BACKEND)
	@echo "Kompiliere Backend..."
	@$(CXX) $(CXXFLAGS) $(SRC_BACKEND) -o $(TARGET) $(LIBS)

# Socket-Server
$(SOCKET): $(SRC_SOCKET)
	@echo "Kompiliere Socket-Server..."
	@$(CXX) $(CXXFLAGS) $(SRC_SOCKET) -o $(SOCKET) $(LIBS)

# ==== INSTALLATION ====
install: all install-socket install-client install-frontend
	@rm pwmctl
	@rm pwmctld
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
	@systemctl start pwmctld.service
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

	# --- Config entfernen (optional, vorsichtig) ---
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

# ==== Optional: Rebuild + Install in einem Schritt ====
rebuild-install: rebuild install