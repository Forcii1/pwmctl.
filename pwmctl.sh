#!/bin/bash

if [ "$1" = "backend" ]; then
    shift
    exec /usr/local/share/pwmctl/backend/pwmctl-backend "$@"
fi

if [ "$1" = "daemon" ]; then
    shift
    exec /usr/local/share/pwmctl/socket/pwmctld "$@"
fi

if [ "$1" = "help" ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: pwmctl [command]"
    echo
    echo "Commands:"
    echo "  backend    Start backend"
    echo "  daemon     Start daemon"
    echo "  help       Show this help"
    echo
    echo "Without a command, the PWMCTL GUI is started."
    exit 0
fi

cd /usr/local/share/pwmctl/frontend || exit 1
exec node_modules/.bin/electron . "$@"