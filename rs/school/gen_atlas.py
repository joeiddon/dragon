import numpy as np
import imageio
from PIL import Image

images = [
    # image name (minus .png), rotate = (0,1,2,3), mirror
    ['right', 2, 1],
    ['left', 2, 0],
    ['back', 2, 0],
    ['front', 2, 1],
    ['top', 0, 1],
    ['bottom', 0, 0],
]

dim = 2048
out = np.zeros((dim, dim, 3))
sz = dim // 3
for i in range(3):
    for j in range(2):
        face = images[i + 3*j]
        img = Image.open('face_images/' + face[0] + '.png')
        img = img.resize((sz,sz))
        img = img.rotate(face[1] * 90)
        img = np.array(img)[..., :3] #remove alpha
        if face[2]: img = np.flip(img, axis=1)
        out[j*sz:(j+1)*sz, i*sz:(i+1)*sz] = img

#imageio.imwrite('atlas.png', out)
print('inserting school atlas into main ../texture_atlas.png')
ta = imageio.imread('../texture_atlas.png')
ta[:2048,2048:] = out
imageio.imwrite('../texture_atlas.png', ta)
