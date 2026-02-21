#!/bin/bash

echo "🦞 AgentFund Quick Start"
echo "========================"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

if ! command -v psql &> /dev/null; then
    echo "⚠️  PostgreSQL CLI not found. Make sure PostgreSQL is installed and running."
fi

echo "✅ Node.js found"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit .env and add your Stripe API keys"
    echo "   Get them from: https://dashboard.stripe.com/apikeys"
    echo ""
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Push database schema
echo "Setting up database..."
npx prisma db push

# Seed with sample data
echo "Seeding with sample data..."
npm run db:seed

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the server:"
echo "  npm run dev"
echo ""
echo "Then open public/index.html in your browser or run:"
echo "  cd public && python3 -m http.server 3000"
echo ""
echo "API will be at: http://localhost:3001"
echo "Frontend will be at: http://localhost:3000"
echo ""
echo "📝 Don't forget to:"
echo "  1. Add your Stripe API keys to .env"
echo "  2. Set up Stripe webhook endpoint"
echo "  3. Create a Stripe Connect account for testing"
