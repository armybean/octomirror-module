#!/bin/sh
#
# This script create a module in base e MagicMirror-Module template
# You can get a copy from https://github.com/roramirez/MagicMirror-Module-Template
#
#
# Manager Module Template
#
# By Rodrigo Ramìrez Norambuena https://rodrigoramirez.com
# MIT Licensed.
#

REPOSITORY_URL=https://github.com/roramirez/MagicMirror-Module-Template
YEAR=$(date +"%Y")

if ! [ -x "$(command -v git)" ]; then
	echo "Please install git"
	exit 1
fi

read -p "Insert your module name? " MODULE_NAME

DIRECTORY_DST="/home/pi/MagicMirror/modules/$MODULE_NAME"
read -p "Do you want create in $DIRECTORY_DST (Y/n) " choice
if [[ ! $choice =~ ^[Yy]$ ]]
then
	read -p "Insert destination module path " DIRECTORY_DST
fi

if [ -d "$DIRECTORY_DST" ]; then
	echo "Warning!. The destination $DIRECTORY_DST exists"
	echo "To prevent override please rename destination directory"
	echo "or run again with another name module or destination path"
	exit 1
fi

# Author & Licenses
AUTHOR_NAME=$(git config user.name)
if [ -z "$AUTHOR_NAME" ]; then
	read -p "Insert your name " $AUTHOR_NAME
fi

read -p "Pickup a license
  1. MIT (Default)
  2. ISC
" LICENSE

case $LICENSE in
	[1] | [MIT] )
		LICENSE="MIT"
		;;
	[2] | [ISC] )
		LICENSE="ISC"
		;;
	* )
		LICENSE="MIT"
		;;
esac


# Create temporal directory
TMPDIR=$(mktemp -d)
# Clone repository here
git clone $REPOSITORY_URL $TMPDIR


# Here add templates stuff
mkdir -p $DIRECTORY_DST
cp -a $TMPDIR/* $DIRECTORY_DST
mv $DIRECTORY_DST/MagicMirror-Module-Template.js $DIRECTORY_DST/$MODULE_NAME.js
mv $DIRECTORY_DST/MagicMirror-Module-Template.css $DIRECTORY_DST/$MODULE_NAME.css
mv $DIRECTORY_DST/templates/licenses/$LICENSE $DIRECTORY_DST/LICENSE.txt
mv $DIRECTORY_DST/templates/CHANGELOG.md $DIRECTORY_DST/
mv $DIRECTORY_DST/templates/README.md $DIRECTORY_DST/
mv $DIRECTORY_DST/templates/package.json $DIRECTORY_DST/
rm -frv $DIRECTORY_DST/templates > /dev/null


sed -i s/\{\{MODULE_NAME\}\}/$MODULE_NAME/g $DIRECTORY_DST/*.*
sed -i s/\{\{AUTHOR_NAME\}\}/"$AUTHOR_NAME"/g $DIRECTORY_DST/*.*
sed -i s/\{\{LICENSE\}\}/$LICENSE/g $DIRECTORY_DST/*.*
sed -i s/\{\{YEAR\}\}/$YEAR/g $DIRECTORY_DST/*.*


cd $DIRECTORY_DST
git init

# Delete temporal directory
rm -frv $TMPDIR 2 > /dev/null
