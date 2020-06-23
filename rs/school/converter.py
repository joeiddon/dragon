import re, json

# only passes ascii stl files for now
# see https://joeiddon.github.io/stl_viewer for js to pass binary

nums = [
    float(x) for x in \
    re.findall(
        '-?[0-9]+\\.?[0-9]*(?:e-?[0-9]+\.?[0-9]*)?',
        open('school.stl').read()
    )
]

positions = []
normals = []

for i in range(0, len(nums), 12):
    # this if is a simple hack to ignore faces entirely on z=0 plane so dont
    # get interference with texture on ground, beneath the school
    if all(z == 0 for z in nums[i+3+2:i+12:3]):
        continue
    for _ in range(3):
        normals.append(nums[i:i+3] + [1])
    for j in range(i+3, i+12, 3):
        positions.append(nums[j:j+3] + [1])

# calculate texture coordinates as follows:
# for each point, find the normal of a cube who's dot product with this point's
# normal is a minimum, then use that face of the cube as the texture - mapping
# the point to its position on that texture based on the minimum and maximum
# dimensional limits of the object (to keep aspect ratio 1:1, second texture
# coordinate is scaled with the same limits as the first coord).
# the texture coordinate is then rescaled from [0,1] to [0,0.333] and
# translated to its corresponding position in a 9x9 grid, only the first two
# rows of which are used. each position in this grid (texture atlas) forms the
# texture for that face of the object
#
# very hacky code!

# dimensional limits of model [[minx, maxx, miny, maxy, minz, maxz]]
limits = [(min(p[i] for p in positions), max(p[i] for p in positions)) \
    for i in range(3)]

def give_percent(x, a, b):
    # returns position of x in range [a,b] as float [0, 1]
    # e.g. x = 2, a = -2, b = 6 gives 0
    return (x-a) / (b-a)

cube_norms = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]
def get_texcoord(point, normal):
    texture_index = 0
    max_dot_prod = -1
    for i, cube_norm in enumerate(cube_norms):
        dot_prod = sum(normal[i] * cube_norm[i] for i in range(3))
        if dot_prod > max_dot_prod:
            max_dot_prod = dot_prod
            texture_index = i

    dim_a, dim_b = [i for i,x in enumerate(cube_norms[texture_index]) if x == 0]
    texcoord = [
        give_percent(point[dim_a], *limits[dim_a]),
        give_percent(point[dim_b], *limits[dim_b])
    ]
    #texcoord = []
    #scale_limits = False
    #for i, cube_val in enumerate(cube_norms[texture_index]):
    #    if cube_val == 0:
    #        if not scale_limits:
    #            scale_limits = scale_limits[i]
    #        texcoord.append(give_percent(point[i], *scale_limits))
    # position texture coord in 9x9 grid and scale down so still [0,1]
    return [
        (texcoord[0] + texture_index % 3) / 3,
        (texcoord[1] + texture_index // 3) / 3,
    ]

texcoords = [get_texcoord(p, n) for p,n in zip(positions, normals)]

# uncomment for texcoords independent of triangle size and direction
#texcoords = [[0,0],[0,1],[1,1],[0,0],[0,1],[1,1]] * (len(positions)//6)

out = json.dumps({
    'positions': positions,
    'normals': normals,
    'texcoords': texcoords
})

open('../school.js', 'w').write('let school = ' + out + ';');
print('wrote output json to ../school.js')

if input('print json? (y/n)') == 'y': print(out)
