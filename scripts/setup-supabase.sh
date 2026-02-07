#!/bin/bash

# ============================================
# Vault-AI Supabase Setup Script
# ============================================
# This script helps set up Supabase for production deployment.
# ============================================

set -e

echo "🚀 Vault-AI Supabase Setup"
echo "=========================="
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed."
    echo ""
    echo "Please install it using one of these methods:"
    echo ""
    echo "  npm install -g supabase"
    echo "  brew install supabase/tap/supabase"
    echo ""
    exit 1
fi

echo "✅ Supabase CLI found: $(supabase --version)"
echo ""

# Check if user is logged in
if ! supabase projects list &> /dev/null 2>&1; then
    echo "📝 Please log in to Supabase:"
    supabase login
fi

echo ""
echo "Choose an option:"
echo "  1. Set up local development environment"
echo "  2. Link to existing Supabase project"
echo "  3. Deploy migrations to linked project"
echo "  4. Generate TypeScript types"
echo "  5. Reset local database"
echo "  6. Exit"
echo ""

read -p "Enter your choice (1-6): " choice

case $choice in
    1)
        echo ""
        echo "🔧 Setting up local development environment..."
        echo ""
        
        # Initialize Supabase if not already initialized
        if [ ! -f "supabase/config.toml" ]; then
            supabase init
        fi
        
        # Start local Supabase
        echo "Starting local Supabase..."
        supabase start
        
        echo ""
        echo "✅ Local Supabase is running!"
        echo ""
        echo "Local credentials (add to .env.local):"
        supabase status
        ;;
        
    2)
        echo ""
        read -p "Enter your Supabase project reference (e.g., abcdefghijkl): " project_ref
        
        if [ -z "$project_ref" ]; then
            echo "❌ Project reference is required."
            exit 1
        fi
        
        echo "Linking to project: $project_ref"
        supabase link --project-ref "$project_ref"
        
        echo ""
        echo "✅ Project linked successfully!"
        ;;
        
    3)
        echo ""
        echo "🚀 Deploying migrations..."
        echo ""
        
        # Check if project is linked
        if [ ! -f "supabase/.temp/project-ref" ]; then
            echo "❌ No project linked. Please run option 2 first."
            exit 1
        fi
        
        # Push migrations
        supabase db push
        
        echo ""
        echo "✅ Migrations deployed successfully!"
        ;;
        
    4)
        echo ""
        echo "📝 Generating TypeScript types..."
        echo ""
        
        # Check if project is linked
        if [ -f "supabase/.temp/project-ref" ]; then
            supabase gen types typescript --linked > types/supabase.ts
        else
            echo "Using local database..."
            supabase gen types typescript --local > types/supabase.ts
        fi
        
        echo ""
        echo "✅ Types generated in types/supabase.ts"
        ;;
        
    5)
        echo ""
        echo "⚠️  This will reset your local database and delete all data!"
        read -p "Are you sure? (y/N): " confirm
        
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            supabase db reset
            echo ""
            echo "✅ Local database reset successfully!"
        else
            echo "Cancelled."
        fi
        ;;
        
    6)
        echo "Goodbye!"
        exit 0
        ;;
        
    *)
        echo "❌ Invalid choice. Please enter a number between 1 and 6."
        exit 1
        ;;
esac

echo ""
echo "🎉 Done!"
