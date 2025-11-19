# ==== CONFIGURATION ====
CXX         := g++
CXXFLAGS    := -g -Wall -std=c++17
TARGET      := pwmctl
SOCKET      := pwmctld
SRC_BACKEND := backend/main.cpp
SRC_SOCKET  := deamon/socket.cpp
LIBS        := -lnvidia-ml
INSTALL_DIR := /usr/local/bin
SOCKET_DIR  := /var/run
GROUP       := pwm

# ==== BUILD RULES ====
all: $(TARGET) $(SOCKET)

# Backend
$(TARGET): $(SRC_BACKEND)
	$(CXX) $(CXXFLAGS) $(SRC_BACKEND) -o $(TARGET) $(LIBS)

# Socket-Server
$(SOCKET): $(SRC_SOCKET)
	$(CXX) $(CXXFLAGS) $(SRC_SOCKET) -o $(SOCKET) $(LIBS)

# ==== INSTALLATION ====
install: all install-socket install-client
	rm pwmctl
	rm pwmctld
	@echo "Installation abgeschlossen."

# Socket-Service installieren
install-socket:
	@echo "Installiere Socket-Server..."
	install -d $(INSTALL_DIR)
	install -m 755 $(SOCKET) $(INSTALL_DIR)/$(SOCKET)

	@if ! getent group $(GROUP) > /dev/null; then \
	    groupadd $(GROUP); \
	fi

	install -d -m 775 -o root -g $(GROUP) $(SOCKET_DIR)

	cp pwmctld.service /etc/systemd/system/
	systemctl daemon-reload
	systemctl enable pwmctld.service
	systemctl start pwmctld.service
	@echo "Socket-Server läuft als Root."

# Client-Service installieren (Instanz-Service)
install-client:
	@if [ -z "$$SUDO_USER" ]; then \
	    echo "SUDO_USER nicht gesetzt. Bitte 'sudo make install' verwenden."; exit 1; \
	fi

	install -m 755 $(TARGET) $(INSTALL_DIR)/$(TARGET)

	usermod -aG $(GROUP) $$SUDO_USER
	@echo "Benutzer $$SUDO_USER wurde der Gruppe $(GROUP) hinzugefügt."

	cp pwmctl@.service /etc/systemd/system/
	systemctl daemon-reload
	systemctl enable pwmctl@$$SUDO_USER.service
	systemctl start pwmctl@$$SUDO_USER.service
	@echo "Backend-Client läuft als Benutzer $$SUDO_USER."

# ==== UNINSTALL ====
uninstall:
	@if [ -n "$$SUDO_USER" ]; then \
	    systemctl stop pwmctl@$$SUDO_USER.service || true; \
	    systemctl disable pwmctl@$$SUDO_USER.service || true; \
	fi
	systemctl stop pwmctld.service || true
	systemctl disable pwmctld.service || true

	rm -f /etc/systemd/system/pwmctld.service
	rm -f /etc/systemd/system/pwmctl@.service
	rm -f $(INSTALL_DIR)/$(TARGET)
	rm -f $(INSTALL_DIR)/$(SOCKET)

	# Gruppe löschen, falls vorhanden
	@if getent group $(GROUP) > /dev/null; then \
	    groupdel $(GROUP); \
	    echo "Gruppe $(GROUP) wurde gelöscht."; \
	fi

	@echo "Deinstallation abgeschlossen."

# ==== RUN / CLEAN ====
run: $(TARGET)
	./$(TARGET)

clean:
	rm -f $(TARGET) $(SOCKET)

rebuild: clean all

# ==== Optional: Rebuild + Install in einem Schritt ====
rebuild-install: rebuild install
