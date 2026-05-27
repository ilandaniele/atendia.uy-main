# Flujo de Whapi

## Partner API

Para iniciar el servicio

```ts
const WHAPI_PARTNER_TOKEN = getEnv("WHAPI_PARTNER_API_KEY");
const WhapiPartnerSvc = WhapiPartnerService({ token: WHAPI_PARTNER_TOKEN });
```

### `WhapiPartnerService.getChannel("channelId")` devuelve

```json
{
  activeTill: 1767367524333,
  apiUrl: 'https://gate.whapi.cloud/',
  creationTS: 1766849124333,
  id: 'SUPRMN-PXEFC',
  ownerId: 'mLWY9yr3hZdSF5gIRcGy6UAHaaY2',
  server: 49,
  token: 'HUCP7HG7iYtLWMI03aytWNmvCO5nLadN',
  stopped: false,
  trial: 1767281124333,
  status: 'active',
  mode: 'trial',
  name: 'Test 1',
  projectId: '9fsRBeYuoj4rCoBsaOAP'
}
```

### `WhapiPartnerService.createChannel("channelName", "phoneNumber")` devuelve

````json
{
  apiUrl: 'https://gate.whapi.cloud/',
  id: 'SUPRMN-PXEFC',
  creationTS: 1766849124333,
  ownerId: 'mLWY9yr3hZdSF5gIRcGy6UAHaaY2',
  activeTill: 1767367524333,
  token: 'HUCP7HG7iYtLWMI03aytWNmvCO5nLadN',
  server: 49,
  stopped: false,
  status: 'active',
  trial: 1767281124333,
  mode: 'trial',
  name: 'Test 1',
  phone: '59899344948',
  projectId: '9fsRBeYuoj4rCoBsaOAP'
}
```

### `WhapiPartnerService.deleteChannel("channelId")` devuelve

```json
{ days: 0, success: true }
```

## Channel API

Para iniciar el servicio

```ts
const WHAPI_PARTNER_TOKEN = getEnv("WHAPI_PARTNER_API_KEY");
const WhapiPartnerSvc = WhapiPartnerService({ token: WHAPI_PARTNER_TOKEN });
const channel = WhapiPartnerSvc.getChannel(channelId);
const WhapiSvc = WhapiService({ token: channel.token });
```

### `WhapiService.checkHealth()` devuelve

#### Lanzamiento

```json
{
  start_at: 1766849130,
  uptime: 182,
  status: { code: 2, text: 'LAUNCH' },
  version: '1.8.7-18-g5f9aea44',
  user: null,
  ip: '157.180.0.159',
  is_business: false,
  channel_id: 'SUPRMN-PXEFC',
  api_version: '5f9aea44',
  core_version: '29f50c024'
}
```

#### Escaneo de QR

```json
{
  start_at: 1766849130,
  uptime: 382,
  status: { code: 3, text: 'QR' },
  version: '1.8.7-18-g5f9aea44',
  user: null,
  ip: '157.180.0.159',
  is_business: false,
  channel_id: 'SUPRMN-PXEFC',
  api_version: '5f9aea44',
  core_version: '29f50c024'
}
```

### `WhapiService.getQRCode()` devuelve

#### TIMEOUT

```json
{ status: 'TIMEOUT' }
```

#### OK

```json
{
  status: 'OK',
  expire: 54,
  base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAYAAAB5fY51AAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAABmJLR0QA/wD/AP+gvaeTAAAAB3RJTUUH6QwbDyEpegYXxwAAGjpJREFUeNrt3XlgFEXax/FfkgG5JMgph4ACSqIrCBgERAFdRURUDgXRdQWPlcMDhPVVxHdddRVUFBHU9UAWUNggKoeuIoqAkoDcyCUCvuByqonhDpn3D3eRzkySSaeqpyfz/fyXZtJTU9V56Hqm+qmEYDAYFADEgES6AAABCwAIWAAIWABAwAIAAhYAAhYAELAAgIAFgIAFAAQsACBgASBgAQABCwAIWAAIWAAQRQETJ6nWrEXUP8j+VctdtTOS34vkXG7P47Z/w71fJG2KZKwi/Symxt3tZ3E7Lm77Kf/rYvm692tbucMCwJQQAAhYAEDAAhDrArZO7HUSuiSvK+nv2P58JpPCkZzLZB+YSgpH+lnc9IHbL2Pcjovt6z5W/j65wwLAlBAACFgAQMACUBoFvHwzt8k4twlCU4lFm6vobfaJ7ZXuXn6WcOc2leB220+2+6U0/21yhwWAKSEAELAAoJgCpfnDuZmXm6wKUJr6zWRFBTfvZ7KChKk8nsm8T6xUh+AOCwAIWAAIWABAwAKAwpXqpLupp/JNJXLDvZ/J5K6pxaRuF1LaXGxp8kuNaJcVtlnRgTssACBgAQABCwABCwCiy9Oku9eJRZuJYi8T+n5IgpsaT7dfINjcU9LtZ7O90t3Lv59YSfpzhwWAKSEAELAAxC1rOSw/Plluc9Gk236x/X5u+sDkmHu9mNXUNl8mx87U9mtu2xQrf5/cYQFgSggABCwAIGABKA2MJN39uujM5jZfsZoU9mN/21wU6jbpb5LbRb6mFs+WpkoQ3GEBIGABAAELAAELAPzOSNLd66oAsbw/m5cVJGz3r6lxMNXuSNvoNpntdTtNXV/R/tKIOywATAkBgIAFAAZEdeGo7YqNXm7hZfP93fa517kwm31nssKB288b7dypyUobpvrX60Wp3GEBYEoIAAQsAAQsAPC7qJZIjjSJaOpcJhcDetkHthObphbmxkrlgFjY2s1tO/1wrbBwFAAIWAAIWABgQUIwGAxGK3dgewGoqa3Ubb6/14sRTW6TbirHEu0xL8m14fVY2Wq3yeuCOywAIGABIGABAAELQDyLatI9Ul4ubPRjEtzrapB+SGZ7XQHE1PUTSZtMjqfNdpvuXxPt4A4LAFNCACBgASBgAYDfWdvmy2aiz21J20jaaXIlttu+c/v+bpO7bs4daR+YGrtIf89Um9wml2N5Czo3/ev15+UOCwBTQgAgYAGIW9YWjnpZAcDt/Lsk7YzkPH74fDa5yTOZ7Ceb/euHBbZeVhy1PS7cYQFgSggABCwAIGABiBcBL9/MVDLO7eJDm220WVHB7bZQJpPSfqyeYHMbNZuLjE2OQSSLo232b3F+j2oNAJgSAgABCwAIWADigZGV7pEm59yW8PVyXzWvKyO4ZTMJ7ocvELz+fDZ5WfLadv9yhwUABCwABCwAiJJANN/cZBXJSH7PD1t45WdzoZ/JPIXbHJ2X+Ue3fe51/tHmtma2c1Ns8wUABCwABCwAIGABQOE8XTgaCa/LGLs5jx+Y2narJGPgdtGtl31gs922v8SJ9pdGbv9eucMCAAIWAAIWAFjgu4qjXi80dMvmA63Rzh24zel4nc+wWcHW623GbD5g74d8HHdYAJgSAgABCwAIWADihbWke6wkCP2Y9Db1WSKtZuDlE/8mK2Kaug68Xjjq9cLc0rRgmjssAEwJAYCABYCABQB+Z6RaQzheJ7NNJSRtr6K3meA21edeJ8a9fnLB7RiYSvJ7PeY2v2gpTp9QIhkAU0IAIGABQAkYWThqu9JkrFZaNLUNlsl8gNuqC+HaWa1ZCyUkJOis+meoScMzNWXsGGP9FO0FkTbHxevr2eb7eb3gNCCgmGpWq6ZrLr9Ml7ROU7tWLXVacjKdAgIW/CMhIUHXXNZJN113rTq1baOkpCRj55795mua+t4H+uecuTqWm0tng4CFklny3rtq3LCBlXO3adFCbVq00IMD79aESZP15j/T6XAQsOBepMFqz/79OnDwoLJzciRJlSpUVIXy5XR6jRpKSEgo9Hfr1qqlx4cN1d1/uJkOh7cByw/lgU0tjjOZOHazUNVkuyNpZ73WbfXk8Ad0S/frCw0yP2ZlaWHmUi1aukwrvvlG327brl8OHAj72vLlyqlR/fo6P6WpLm7VUpe2TtPpNWoUGLjcsnmNuf0SxdQXHSavlfy/Z3urPu6wYM3Hk99SapMmYf/teF6e5n72ud6ZNVufLv4y4pzTocOHtXbTJq3dtElT3/9AiYmJateqpW68uou6d75Sp5QtS8eDgIXiCxesco8f19sfzNILb0zU1h07SvweeXl5Wpi5VAszl+rxceM14Ja+uv3GGwhcKBQLR1GkJStWqmOfvrrvsceNBKv8du3dq5HPPa+2PXrpX18spMPBHRaK71hurv46dpzGT56igp6RT0pMVPNzU9W+VSv9ruk5atSggU6vXl0VypdTUlKSDh4+rD379mvL9u1at3mzFi37WstWr9GRo0dDzrVtx07ddO/96tPtGo16cLgqlC/PIMDBSLWGWC4V6/bcXq5WdttPkfTBxRe20vuvvRryuj379+uW+x/QsjVrwp7nrPr1dVvPHurZpbNqVqtWrM/zc3a23v9kniamz9DqDRvDvuacs87SlBee05n16jmOB4NBDXxkpKbNmmOsP71+UsNkdQhT168XFSuo1oASaVivnv4x5tmQ41t37FCXP/YPG6wa1qurvz/1pJbMTNeAW/oWO1hJUpXKlXVrj+6aP3Wypo0bq3PD5Mw2fveduvyxf0hAS0hI0POPjlSL885lAOMQAStOlS1TRq+PfkqVTz3VcXz7zh/Utd8dIbmqpMRE3d+/nxanT1f3K69QUmLJL52EhARd3q6t5r89WY8PHRKScN+zf7+uveMurdm4KaTtbz4zSlUqV2YgCViIByMGD1Lz1FTHsX0//qieAwZp1969juM1q1XTzFcmaMSgASp3yinG2xJIStLdN9+kf02aGDIFzM7J0Q0DB2vbjp2O4/Vq19aohx5kIOOMtYqjJue/pvIJXj+BHytbJ0m/LjPoOWCQFmRkOo43qFtHMya8pDPPOMOTdvyYlaU+g+8LmY6mNG6kT/7xlsqXK+c43mvAIM1f/GWJxsoPFR28XmhtKodVnPwuOSwYM+qVv4cEq4b16urDiW94FqwkqWpystInjNP5KU0dx9d/u0UPjQ7Ntz0xbKjKBPiymykh4sa6zZs15vU3nP9LVqmi9AkvqVb16p6359SKFTX9xbFqULeO4/ikd2eGBNWzzzxTvbtdwyASsBAPgsGghj35lHKPH//tokhM1PjHHwvJJ3mpRrWqev3pp1S2TBnH8T8/NUpHjx1zHLuv/21Gy92AgAWf+mjBF8pYucpxrP8NvXR5u7ZhX388L0+vTH1bvQffq14DB2v6nLnW2nbBuakaftcdjmObt23TlPc/yDd1raeunToymHEgJpLupsTKllpeLgb8/S23avnadSd+rlW9upbMTFflSpXCvn7AI49q2uzfFm2WCQS0Ys4Hql2zppUxO3rsmNrf0Fvfbtt+UoCqq4z33lXA5V2Vza3HTF53fvx7sVmWmjssFGrp6tWOYCVJQ/r3KzBYTZ8z1xGspF8f33kzfYa1NpYtU0YPDxzgOLZtx0599PkCBpApIeJJ/sdbqletqpuvvzbsa/Py8jTq5VfD/tukd2eGfTbQlK6dOqpRg/rO4Dn3QwaQgIV4cTwvT+998onj2I1XdylwYejajZsKrNSwd/+Pev+TefYu0sRE3XL9dY5j8xYtLrBYIAhYKGVWr9+gn7KyHcd6Xd2lwNdv+O67Qs/38pS3rba3R+fOSjzpcaAjR4/qy6+XM5BxxtN9Cb1eMe6mpK3tcsQ2V1kX51wLly5z/FyrenWdd3aTAl+fl5dX6PlWrV+v/T//rGpVqli5UOvUqqnUxo21dtNvzxUuXva1rrykveN1515+ZcijRW7GzuaYR3ouNyvdTV5P0U6wc4eFk6Z4zioI7Vq2KLR+e1F11pulpFgLVv/VtqXzD2j1xtDSNGfVP4PBZUqI0mbz9u2On1ObNC48IKWmFFi+uFLFChr/179Yb3P+Nn73/fchr2nUoAGDS8BCafN/P/yQ786kfqGvr1ypkjpfeknYfxv/2F/UtNFZ1tuc/5vCH3bvCVn17qY+F2JHVJ8adbswzmZlBJP5OFM5Oxv5sV9ynN+wVT/ttCLbes8f/6AP5n0aUi45OV9NLWvXS74pZzAY1IGDh1Q2uYzjbs/WdejHbeqivfVYcfqAag1w5cjRo45nByVFVD+9eWqqul1+WcjxYX97WoePHLHe7koVKoYG3gM5Rb4GTAkRy7fVgUBIgj3S/QWfHDY05I5q09atGvHMc9bbnT/ISlIgKZDvNbkMMAELpUlSYqIqVnDeUf2UlRXR755eo4aefnB4yPE302do7MRJVtud/25Kkk6t5Lyjyjl4kAEmYKG0qXKqsx76z9nZEf9ury5Xqf+NN4Qcf2zsi3p92nRrbd61d5/j5zKBgCrmm8rmsPq9dM8OYrHRXi9Ws7mAzm3VhZL2Qd3Ta2nHrl0nft6wZUuxfv+JB4Zo+44dmndSeeJgMKjhT43S1h07NPKewSG1rCRp/88/6+b7hig7J0e39eypPt26qmKFyBLl327b5vi5Yb16jtXvkjTy3ns08t57Ch27WKme4HWS39S5bPYTd1hx6vymzhLEX+er2lCUMoGAJj4zSq2bNwv5twmTp6pr/zscq9KlX5P9tw4dpsxVq7Vhy3f689Oj9LvOV+t/nx+rnbt2F/meq9ZvcPzcuCFrrpgSIi40T01x/Lzym/Uha5qKUr5cOU0f96LatQz9H/XrNWvVsc/NuuuhEdq0davy8vJ032OP66vlKxyvy/rlF7341iS1vOZaDXr0LzpeyCNA+R8nasnehAQsxIe0Zuc7fj5w8KA+PWl6F6lKFSto2rixujpMxc+8vDylf/iR2nTvpbM7XV5oddJjubl6+4NZ+mH37gLurtbr33v2OI61T7uQgYwz1iqORrtaos05ekn6wNQ2VMXt3/v799OIewY5jl16402Oads1l3XSxGdGufqswWBQL7w5UU++NKHQu6Si7ti2LJgf9hGgh0Y/q1em/lYRolqVKvpm3r+KrDrqh7yPqfE0WQXV1N+H19vbcYcVJz5euDDk2HVXXJ7vNYuKXengxP98CQm6r99tmv3Ga2G3no9E6+bNwgar7JwcvTNrtuPY9Z2vcF0iGUwJ4XPrNm3WzpO+FZSk7p07O7acP3L0qEa/+vcSTzXnvz1ZTzwwpFjP9Z1StqyG33Vn2H977Z3pyvrlF8exm9jai4CF0m3q+7McPzeoW0c9rursODZ55vvasv37Er1PIClJf+p7k1bOnaUxjzxcZCWI+nXq6N2Xx4f9xnHX3r16YeJEx7FL0tLULCWFASVgoTR7Kz1dx/J9Ezjk9n6Ou6zc48f16PMvGHm/U8qW1R+6X6+F099RxswZenjgAF3Wtq0aNaiv81Oa6or2F+vZhx/SkpnpuuiC5mHP8eDTo5VzwLl6/YE7+jOYccrThaNuF8J5XYkh2kxt85Xfv/fs1Zz5n+m6K684caxJw4Zqlpri2D3HxtbvjRs20JDb+xXrdyamv6tZn853HOvSsYPatWrpODb/y6/U6+6BYfvFZKLabbVYW+MZaRtMffkTaZsKeg3VGlBsh48czffzEX2z+VvHsY5tLop6O79cvlwPjX7GcaxC+fJ6ctjQkNc+++prDCxTQpRGHdq0dvz81fIVIaVhoh2w1mzcpJvvGxqyddhTw4fpjNq1HcfmzP9MS1asYGAJWChtUps00ek1ajiOffbVkpCpW/6g4KVFS5ep2+13hnwreGPXq9X3um6OY4cOH9aIZ55lYAlYiIe7K0n6bIkzYHVq0yYqbQsGg3pl6tvqNXCwsnOcZWTatWyhMY88HPI7T4wbr+93/sDAxhEjK91NJvXCsfnUuttVyKa+QDC5Urm4Sc3d+/bp3CuucpQ8nvrCmJCts37Oztaipcu0fN063dStm/GHjr/7/nsN+9vT+nxJRsi/NUtJ0XuvTlDlSpVcX4te9GVx3t/mFz3RvJ68EJPlZWDG50syHMGqbJkyurhVSx06fFgZK1fpi8xMLchYqjUbNpx43OalSZPV46rOGnbn7TrzjJJtqfXvPXs0duIkvTXj3bBb3V+SlqZJz43WqRUpewwCVtzLn7+qWKG8+tx7v5atXhM2gEi/rtOaNnuOZnz4kTpc1FrdO1+pLh07RBxUDh46pAUZmZo2e44+XriowPfp16unnhg2NGxNLRCwEGeCwaA+yzcF+ykrW4uXfR3R7+ceP655i7/UvMVfqkwgoKaNzlKzlBQ1bdRIpyVXVpXKlRUIBJRz4IB279unLdu/17rNm/X1mrWF1o8/LbmyRv/Pg7r+pLViwH95msMy9US610+t21zU51X+YmH6NKWe9FDy6g0b1bFP34jP/d/V8G4rMRQlMTFRfbp11ch7BofdcuynrCz1HnSvlq1eXeL+dbsA1O01Z2pxpx+uuZL8nZloG3dYcaBW9epKaex8nm/+V18V+XsN69XVpa1b69LWabokLU3ZOTl6ecpU/WPmezp0+LCxQPX7i9vpwT/dpfNTmhb4uitvubXEzziCKSFiQMc2F4Vs6xXuG7naNWvqkrQL/xOgLlTtmjVDpmt/G/6AhvTvp5kff6zZn87XkhUrXd11nXf22epxVWf16tI55H3CIViBgBUnOuRbuX7w0CFlrlyl05Irq12rVr8GqbS0iJcr1KhWVXf26a07+/TWvh9/VOaq1VqzcZPWbNyonbt3Kys7W1m/5CgYDKpihfKqWL6CGjWoryYNG+p3Tc9R+wtbsaU8CFgI79KLnAtGDx89qrlvvqbzmzYN2XWmuKpXraouHTuoS8cOdDRiN2CZXEwa7bKssVLuOVw/nXfO2SF3M1WTk1U1OblY516YuVRpBVQENSE3N1czPvxIY157Q5u3bYv6teKHyh5ukuwmvwAz+X7cYSEiHQ09anPdHXfptORk9b6mq26+/jo1bdzIyHk3bd2qf86eq2mz54RURAUIWPEWsNoWXXkhNzdXy9eu04KMTH2RkaFZb4Qv1/JTVpYmTJ6iCZOnqH7dOloxd3ax27N73z6tWLtOX2Rk6ovMpVr/7bcMEghY+HUXmosuuKDI1zVq30E5Bw8W69zhHjru1LuvalSrqlMrVTqx8n3MyBGO16RexoJQELAQRtuWLU7knHbt3auMFSt17RW/D3ldcYNVQVatXx9yLH/AAkrC2kp3t/xQUcFUu031p9tz973nftWoVlVfZGRq+86dJepfm9eGzaSw1+12e+5oJ/Rj5WkO7rBKsY8WLKATUKpQwA8AAQsAfDkldJtTMjX/jvTcXudmos3rqhY2rxWbCyLDncfriqOm/l4iPU+sLrDlDgsAU0IAIGABIGABgN8ZSbq7TeTa3K4r3Ou8fro/krZ7veDVbaLabTLZ62oCpphMJtuscOB20a+pxdjFGTsTyXjusAAwJQQAAhaAuGXk4WeTeQK3OQC3/LiAzuaDqX58qNgPizRt/p6pMTB1jUfrb5EcFgCmhABAwAIAAhaAeBDViqN+qPJgs002n8B3y2TFUTdfDtiu1mBzzE39XqTnMsXm4mSvK45yhwWAKSEAELAAELAAwO+sJd1jJZFpqk02V2vb/ryxsDWWH9vg9rq3+cWOH7Zo4w4LAAhYAAhYAGCBpzs/m6rY6Ha+bbONJt/P1EJOk+8X7a3b3W5fFcn7eb1Y2Otz++E65w4LAFNCACBgAQABC0C8MJJ0N/l0fyS/55bNpKXNZKfbhHMsbw9m6hozNQYlObfXSX5T54mknTYXInOHBYApIQAQsACAgAUgFllb6e6Hsqw293+L9h51sfJ7pvrXZhUCm09glKQv3bQz3Lkj+VuMlZXv3GEBYEoIAAQsAHHLSA7L7ZzcbV7A5uJOk9tQRdJ2r6uZ2qxK6offM3VdeL241O25or2Y1evcJndYAJgSAgABCwABCwD8zsg2X5HyekstrxOCkbC5eDbapY5NjkEsLGT0uhyxH/uyOG0y0Q7usAAwJQQAAhYAAhYA+J2RpLvb8qpe77cXCZPlnqOdJPX6S4doP6Vgsg1eP11gc4xNXpteXr/cYQFgSggABCwAOIm1HJYf5sQ2c1im+srrxZ1e5y68rBxqe/z8uBDZ7ecnhwUATAkBgIAFgIAFAHZ4Wq3BFD8sIoz2Nl9+TLqb5LaMsanP54dqETYXJ8dKH3CHBYApIQAQsADgPwKx2GiTDyhHe95uMs9lc5Gmqb5yu9jT5mexnQ90m49z0y7bn6UkOTMqjgJgSggABCwAIGABiAdGku5+WIzodZXOSBKpXlcTMLXY0u0CRZOf1+YXCG77ydRns/mlkclx8eO2YtxhAWBKCAAELAAELADwO2sr3f1QqtZUG0xWa4h2gjtWnu63uTrc7Ri47d9oVz3w41MC3GEBYEoIAAQsACimqG5V73aebHJBpNvPZ2rO74fFeX6sQmqz4qiphaNeL8z147hwhwUABCwABCwAIGABgFMgnj5sJElS2wv/vC5j7KYPSnKuotjcMs3kGLhNgntd1SLaY87CUQAgYAEgYAEAAQsAnALx3gE2k6s22+R18tpmotjrKhNettsP14Ufx5w7LABMCQGAgAUAxeRpDsuPlRdtVp+MJC8Q7UWT4c4fab7I1MJRU2Pn9v1M5sdMjqfNyhNuF4CycBQACFgACFgAQMACgMJZS7r7seSrzWoNbreh8npBpNdJfq+vCzf9G+0vg0rSLzYrT0RyLq8Xl3KHBYApIQAQsAAQsACAgAUAhhjZSBUAuMMCAAIWAAIWABCwAICABYCABQAELAAELAAgYAEAAQsAAQsACFgAQMACQMACAAIWABCwAJR2/w9VGLqzaEhXaQAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNS0xMi0yN1QxNTozMzo0MSswMDowMK/LTh4AAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjUtMTItMjdUMTU6MzM6NDErMDA6MDDelvaiAAAAAElFTkSuQmCC'
}
```

### `WhapiService.getChannelSettings()` devuelve
```json
{
  "media": {
    "auto_download": [],
    "init_avatars": false
  },
  "webhooks": [],
  "offline_mode": false,
  "full_history": false
}
```

### `WhapiService.updateChannelSettings({
  webhooks: [
    {
      mode: "body",
      events: [{ type: "messages", method: "put" }],
      url: "webhook_url"
    }
  ]
})` devuelve

```json
{
  "before_update": {
    "media": {
      "auto_download": [],
      "init_avatars": false
    },
    "webhooks": [],
    "offline_mode": false,
    "full_history": false
  },
  "after_update": {
    "media": {
      "auto_download": [],
      "init_avatars": false
    },
    "webhooks": [
      {
        "url": "https://atendia.uy/api/webhook",
        "mode": "body",
        "events": [
          {
            "type": "messages",
            "method": "put"
          }
        ]
      }
    ],
    "offline_mode": false,
    "full_history": false
  },
  "changes": [
    "webhooks"
  ]
}
```
