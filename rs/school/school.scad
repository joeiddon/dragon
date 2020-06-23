base_shape = [
[1.1, 0], [1.1, 1], [1, 1], [1, 2], //right side
[0, 3.2], //point
[-1, 2], [-1, 1], [-1.1, 1], [-1.1, 0]]; //left side

module pent(size, length) {
    translate([-length/2, 0, 0])
    rotate([90, 0, 0]) rotate([0, 90, 0])
    linear_extrude(length)
    scale(size) 
    polygon(base_shape, convexity=10);
}

module spire(h1, h2, d, sides) {
    cylinder(d=d, h=h1, $fn=sides);
    translate([0, 0, h1])
    cylinder(d1=d, d2=0, h=h2, $fn=sides)  ;
}

module building(){

pent(1.99, 10); //middle pent
pent(1.5, 45); //long pent
translate([4.6, -2.1, 0])
spire(7, 3.7, 2.4, 7); //big spire
spire(7.5, 1.3, 0.7, 8); //middle spire
//cylinder(h=8.9, d=0.2, $fn=3); //point of middle spire

module slats() {
    for (x = [0 : 3]) {
        translate([x * 1.5 -0.25, 0, 0])
        rotate([90, 0, 0]) rotate([0, 90, 0])
        linear_extrude(0.5)
        polygon([[2.3, 0], [2.3, 3], [2.1, 3.8], [-2.1, 3.8], [-2.3, 3], [-2.3, 0]], convexity=10);
    }
}
slats();
mirror([1, 0, 0]) slats();

chimneys = [
    //[position, height, centre offset]
    [5, 7.8, 0],
    [9.3, 6, 0],
    [12.5, 6.4, 0],
    [14.9, 6.3, 0],
    [18.5, 6, 0],
    [20.9, 5.5, 0.7]
];

module chimneys() {
    for (chimney = chimneys) {
        translate([chimney[0], -chimney[2], 0]) {
            translate([-0.4/2, -0.5/2, 0])
            cube([0.4, 0.5, chimney[1]]);
            translate([-0.5/2, -0.6/2, chimney[1] - 0.3])
            cube([0.5, 0.6, 0.3]);
        }
    }
}
chimneys();
mirror([1,0,0]) chimneys();

house_length = 3.3;
houses = [
    //[position, scale, raise]
    [22.5, 1.1, 1],
    [17.7, 0.7, 2],
    [14.2, 1.6, 1.1],
    [12.2, 0.9, 2.5],
    [  8, 0.7, 2],
];

module bell_tower() {
    translate([0, 0.8/2, 0])
    rotate([90, 0, 0])
    linear_extrude(0.8)
    scale(0.3)
    difference() {
        polygon([[1, 0], [0, 1.8], [-1, 0]], convexity=10);
        scale(0.8)
        polygon([[1, 0], [0, 1.8], [-1, 0]], convexity=10);
    }
}

module houses(){
    for (house = houses) {
        translate([house[0], 0, house[2]])
        rotate(90)
        pent(house[1], house_length);
    }
    // bell tower(s)
    translate([11.7, 0, 0]) {
        translate([0, 0, 5.5])
        bell_tower();
        for (t=[[1, -1], [1, 1], [-1, 1], [-1, -1]])
        translate([0.2*t[0], 0.2*t[1], 0])
        cylinder(d=0.1, h=5.6, $fn=5);
        translate([-0.6/2, -0.6/2, 0])
        cube([0.6, 0.6, 5.2]);
    }
}
houses();
mirror([1, 0, 0]) houses();

// cube fills up cavity at ends and makes red stripe more uniform height
translate([-23.75, -house_length/2, 0])
cube([47.5, house_length, 2.1]); // this determines its length
}

module arch() {
    w = 1;
    t = 6;
    h = 1.2;
    translate([0, t/2, 0])
    rotate([90, 0, 0]) {
        translate([0, h, 0])
        scale([1, 1.2, 1])
        cylinder(d=w, h=t, $fn=15);
        translate([-w/2, 0, 0])
        cube([w, h, t]);
    }
}

difference() {
    building();
    translate([0.8, 0, 0]) arch();
    translate([-0.8, 0, 0]) arch();
}


//translate([0,0,5.5])
//cube([47.5,0.1,11], center=true);
