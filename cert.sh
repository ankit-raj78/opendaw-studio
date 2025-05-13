#!/bin/bash
echo "mkcert localhost"
(cd app && mkcert localhost) || exit 1