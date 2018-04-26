#!/bin/bash

NAME="ec2-user"
DIR=/home/ec2-user/{APPNAME}
USER=ec2-user
GROUP=ec2-user
WORKERS=3
BIND=unix:/home/ec2-user/run/gunicorn.sock
DJANGO_SETTINGS_MODULE={APPNAME}.settings
DJANGO_WSGI_MODULE={APPNAME}.wsgi
LOG_LEVEL=error

cd $DIR
source ../bin/activate

export DJANGO_SETTINGS_MODULE=$DJANGO_SETTINGS_MODULE
export PYTHONPATH=$DIR:$PYTHONPATH

exec ../bin/gunicorn ${DJANGO_WSGI_MODULE}:application \
  --name $NAME \
  --workers $WORKERS \
  --user=$USER \
  --group=$GROUP \
  --bind=$BIND \
  --log-level=$LOG_LEVEL \
  --log-file=-



[program:{APPNAME}]
command=/home/ec2-user/bin/gunicorn_start
user=ec2-user
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/home/ec2-user/logs/gunicorn-error.log


#!/bin/bash

NAME="{APPNAME}"                              #Name of the application (*)
DJANGODIR=/var/www/{APPNAME}/integracao             # Django project directory (*)
SOCKFILE=/var/www/{APPNAME}/run/gunicorn.sock        # we will communicate using this unix socket (*)
USER=ec2-user                                       # the user to run as (*)
GROUP=wheel                                     # the group to run as (*)
NUM_WORKERS=1                                     # how many worker processes should Gunicorn spawn (*)
DJANGO_SETTINGS_MODULE={APPNAME}.settings             # which settings file should Django use (*)
DJANGO_WSGI_MODULE={APPNAME}.wsgi                     # WSGI module name (*)

echo "Starting $NAME as `whoami`"

# Activate the virtual environment
cd $DJANGODIR
# source /var/www/{APPNAME}/venv/bin/activate #no venv being used atm                   
export DJANGO_SETTINGS_MODULE=$DJANGO_SETTINGS_MODULE
export PYTHONPATH=$DJANGODIR:$PYTHONPATH

# Create the run directory if it doesn't exist
RUNDIR=$(dirname $SOCKFILE)
test -d $RUNDIR || mkdir -p $RUNDIR

# Start your Django Unicorn
# Programs meant to be run under supervisor should not daemonize themselves (do not use --daemon)
exec /var/www/{APPNAME}/venv/bin/gunicorn ${DJANGO_WSGI_MODULE}:application \
  --name $NAME \
  --workers $NUM_WORKERS \
  --user $USER \
  --bind=unix:$SOCKFILE


/home/ec2-user/Envs/env3/bin/python ./manage.py runserver {IP_SERVER}:8000
