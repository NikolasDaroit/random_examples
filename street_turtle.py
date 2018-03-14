from turtle import*
from random import*
from time   import*
limesq = -650
limdir = 650
tamrua = 40
limcim =300
limbai =-300
angulo = [90,0,-90]
tt = limdir + limesq
cornesq = tt/2 - tamrua
corndir = tt/2 + tamrua
aberto = True

## - - - -      Contruçao da rua        - - - - ##
def construcao(x0,y0,x,y):
    pu()
    goto(x0,y0)
    pd()
    goto(x,y)
def tracejado(cx1,cy1,cx2,cy2,l1,l2,x1,y1,x2,y2):
    construcao(cx1,cy1,cx2,cy2)
    for i in range (l1,l2):
         if i % 50==0:
             construcao(x1,y1,x2,y2)
    
def estrada():
    ht()
    speed(0)
    #### x principal esq
    construcao(limesq,tamrua,cornesq,tamrua)
    ### y cima esq
    construcao(cornesq,tamrua,cornesq,limcim/2 - tamrua)
    ## x \\ x esq
    construcao(cornesq,limcim/2 - tamrua,limesq,limcim/2 - tamrua)
    construcao(limesq, limcim/2 + tamrua,cornesq,limcim/2 + tamrua)
    ### y cima esq
    construcao(cornesq,limcim/2 + tamrua,cornesq,limcim)
    ### y cima dir
    construcao(corndir,limcim,corndir,limcim/2 + tamrua)
    ## x \\ x dir
    construcao(corndir,limcim/2 + tamrua,limdir,limcim/2 + tamrua)
    construcao(limdir, limcim/2 - tamrua,corndir,limcim/2 - tamrua)
    ### y cima dir
    construcao(corndir,limcim/2 - tamrua,corndir,tamrua)
    #### x principal dir 
    construcao(corndir,tamrua,limdir,tamrua)
    construcao(limdir,-tamrua,tt/2 + tamrua,-tamrua)
    ### y baixo
    construcao(corndir,-tamrua,corndir,limbai)
    construcao(cornesq,limbai,cornesq,-tamrua)
    #### x principal esq
    construcao(cornesq,-tamrua,limesq,-tamrua)
    ## tracejado
    construcao(limesq,0,limesq,0)
    for i in range (limesq,limdir):
         if i % 50==0:
             construcao(i,0,i+25,0)
    construcao(tt/2,limbai,tt/2,limbai)
    for i in range (limbai,limcim):
         if i % 50==0:
             construcao(tt/2,i,tt/2,i+25)
    construcao(limesq,limcim/2,limesq,limcim/2)
    for i in range (limesq,limdir):
         if i % 50==0:
             construcao(i,limcim/2,i+25,limcim/2)
             


## - - - -      Carros      - - - - ##
             
car = []
for i in range(15):
    car.append( Turtle() )
    car[i].ht()
    #car[i].shape("square")
    register_shape("carrog.gif", shape= "square")
    car[i].shape("square")

## - - - -      Sinaleira       - - - - ##
sinal = []
for i in range(3):
    sinal.append( Turtle() )
    sinal[i].ht()
    sinal[i].pu()
    sinal[i].speed(0)
def sinaleira(p,x,y):
    sinal[p].goto(x,y)
    sinal[p].pd()
    sinal[p].color("green","green")
    sinal[p].begin_fill()
    sinal[p].circle(10)
    sinal[p].end_fill()




## - - - -      Tragetoria      - - - - ##
def pontoInicialEsq(c):
    c.pu()
    c.ht()
    c.goto(limesq +10,-tamrua/2)
    c.st()
    c.seth(0)
def pontoInicialDir(c):
    c.pu()
    c.ht()
    c.goto(limdir -10,tamrua/2)
    c.st()
    c.seth(180)
def curva (pos,lugar,a,ang,c):
    if (pos == lugar) and (a == ang):
        c.left(a)
def limMapa(c,posx,posy):
    if (posx <= limesq) or (posx >= limdir) or (posy <= limbai) or (posy >= limcim):
        if randint (0,1) == 0:
            pontoInicialEsq(c)
        else:
            pontoInicialDir(c)
def tragetoriaEsq (c,xa):
        a = angulo[ randint(0,len(angulo)-1) ]
        d = 100
        x,y = c.position()
        c.speed(0)
        c.st()
        c.fd(1)
        curva(x,tt/2 +tamrua/2,a,90,c)
        curva(x,tt/2 -tamrua/2,a,-90,c)
        curva(y,limcim/2+tamrua/2,a,90,c)
        curva(y,limcim/2-tamrua/2,a,-90,c)
        limMapa(c, x,y)
        
        ## distancia dos carros
        if x > xa -d and x < limesq +d:
            c.fd(-1)

def tragetoriaDir(c,xa):
        a = angulo[ randint(0,len(angulo)-1) ]
        d = 100
        x,y = c.position()
        c.speed(0)
        c.st()
        c.fd(1)
        curva(x,tt/2 +tamrua/2,a,-90,c)
        curva(x,tt/2 -tamrua/2,a,90,c)
        curva(y,limcim/2+tamrua/2,a,-90,c)
        curva(y,limcim/2-tamrua/2,a,90,c)
        limMapa(c, x,y)
        
        ## distancia dos carros
        if x > xa +d and x > limedir -d:
            c.fd(-1)


## - - - -      Movimentaçao        - - - - ##


sinaleira(0,cornesq - 20, -tamrua -21)
sinaleira(1,corndir + 17, tamrua +1)
sinaleira(2,corndir + 11, tamrua +45)


estrada()
delay(0)
for i in car:
    if randint (0,1) == 0:
        pontoInicialEsq(i)
    else:
        pontoInicialDir(i)
    
while True:
    p = 0
    for c in car:
        x,y = c.pos()
        if p > 0:
            xa,ya = car[p-1].pos()
            tragetoriaEsq(c,xa)
        else:
            tragetoriaEsq(c,limesq + 500)
    p = p + 1
