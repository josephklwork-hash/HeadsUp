#!/bin/bash

# Daily.co Room Deletion Script
# Usage: ./delete-daily-rooms.sh YOUR_DAILY_API_KEY

if [ -z "$1" ]; then
  echo "Error: Please provide your Daily.co API key"
  echo "Usage: ./delete-daily-rooms.sh YOUR_DAILY_API_KEY"
  exit 1
fi

API_KEY="$1"

echo "Fetching all rooms with 'headsup-' prefix..."

# Get all rooms and filter for headsup- prefix
ROOMS=$(curl -s -X GET 'https://api.daily.co/v1/rooms' \
  -H "Authorization: Bearer $API_KEY" | \
  jq -r '.data[] | select(.name | startswith("headsup-")) | .name')

if [ -z "$ROOMS" ]; then
  echo "No rooms with 'headsup-' prefix found."
  exit 0
fi

echo "Found the following rooms:"
echo "$ROOMS"
echo ""
echo "Deleting rooms..."

# Delete each room
echo "$ROOMS" | while read -r room; do
  echo "Deleting: $room"
  curl -s -X DELETE "https://api.daily.co/v1/rooms/$room" \
    -H "Authorization: Bearer $API_KEY"
  echo " ✓"
done

echo ""
echo "Done! All headsup rooms have been deleted."
