#!/bin/bash

# Meeting Summarizer - Docker Startup Script

echo "🚀 Starting Meeting Summarizer..."
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ Error: .env.local file not found!"
    echo "Please copy .env.example to .env.local and configure your settings:"
    echo "  cp .env.example .env.local"
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running!"
    echo "Please start Docker Desktop and try again."
    exit 1
fi

# Build and start the container
echo "📦 Building and starting the container..."
docker-compose up -d --build

# Wait a few seconds for the container to start
sleep 5

# Check if container is running
if docker-compose ps | grep -q "Up"; then
    echo ""
    echo "✅ Meeting Summarizer is running!"
    echo ""
    echo "🌐 Access the application at:"
    echo "   http://localhost:3300"
    echo ""
    echo "📊 View logs:"
    echo "   docker-compose logs -f"
    echo ""
    echo "🛑 Stop the application:"
    echo "   docker-compose down"
    echo ""
else
    echo ""
    echo "❌ Failed to start the container. Check logs with:"
    echo "   docker-compose logs"
    exit 1
fi
