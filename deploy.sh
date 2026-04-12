#!/bin/bash
# Production deployment script for Family Hub

# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y python3 python3-pip python3-venv nginx certbot python3-certbot-nginx

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install flask flask-cors gunicorn

# Set up systemd service
sudo cp family-hub.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable family-hub
sudo systemctl start family-hub

# Configure nginx
sudo cp nginx.conf /etc/nginx/sites-available/family-hub
sudo rm -f /etc/nginx/sites-enabled/family-hub
sudo ln -s /etc/nginx/sites-available/family-hub /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Get SSL certificate (optional)
# sudo certbot --nginx -d yourdomain.com

echo "Deployment complete. Access at http://yourdomain.com"