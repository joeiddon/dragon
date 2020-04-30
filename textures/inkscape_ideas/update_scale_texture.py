import imageio

i = imageio.imread('../../texture_atlas.png')
i[512:, 512:] = imageio.imread('rect1047.png')[:,:,:3]
imageio.imwrite('../../texture_atlas.png', i)
