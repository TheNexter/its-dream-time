#!/bin/bash
rm -f its-dream-time.zip
cd ./app && zip -r ../its-dream-time.zip * -x README.md LICENSE build.sh && cd ..
echo -e "Build done\nZIP file \"its-dream-time.zip\" is ready for firefox extension review"