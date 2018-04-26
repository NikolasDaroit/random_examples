import requests
import time
nivel = 0
while(nivel < 10):
    payload = {'username':'02080186', 'password':'12qwaszx'}
    POST_LOGIN_URL = 'https://moodle.canoas.ifrs.edu.br/login/index.php'
    url_logout = 'http://moodle.canoas.ifrs.edu.br/login/logout.php'
    REQUEST_URL = 'http://moodle.canoas.ifrs.edu.br/course/view.php?id=705'
    with requests.Session() as session:
        post = session.post(POST_LOGIN_URL, data=payload)
        r = session.get(REQUEST_URL)
        nivel = int(r.text.split('vel #')[1][:1])
        print nivel
    # time.sleep(2)