#!/bin/bash

echo "Docker Permission Fix Script"
echo "--------------------------"

# Check if script is run as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (with sudo)"
    exit 1
fi

# Create docker group if it doesn't exist
if ! getent group docker > /dev/null; then
    groupadd docker
    echo "Created docker group"
fi

# Add current user to docker group
USER=${SUDO_USER:-$USER}
usermod -aG docker $USER
echo "Added $USER to docker group"

# Set correct permissions for Docker socket
if [ -e /var/run/docker.sock ]; then
    chmod 666 /var/run/docker.sock
    echo "Set permissions for Docker socket"
fi

# Restart Docker service
systemctl restart docker
echo "Restarted Docker service"

echo "--------------------------"
echo "Changes applied. Please log out and log back in for changes to take effect."
echo "After logging back in, test with: docker ps" 