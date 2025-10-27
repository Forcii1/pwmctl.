# ==== CONFIGURATION ====
CXX       := g++
CXXFLAGS  := -g -Wall
TARGET    := pwmfix
SRC       := main.cpp  
LIBS      := -lnvidia-ml 
# ==== BUILD RULES ====
all: $(TARGET)

$(TARGET): $(SRC)
	$(CXX) $(CXXFLAGS) $(SRC) -o $(TARGET) $(LIBS)

run: $(TARGET)
	./$(TARGET)

clean:
	rm -f $(TARGET)

rebuild: clean all
