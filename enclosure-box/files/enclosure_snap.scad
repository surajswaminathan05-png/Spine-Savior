
// Which one would you like to see?
part = "both"; // [box:Box only, top: Top cover only, both: Box and top cover]

// Size of your printer's nozzle in mm
nozzle_size = 0.35;

// Number of walls the print should have
number_of_walls = 3; // [1:5]

// Tolerance (use 0.2 for FDM)
tolerance = 0.2; // [0.1:0.1:0.4]

// Interior dimension X in mm
interior_x=50.5;

// Interior dimension Y in mm
interior_y=40.5;

// Interior dimension Z in mm
interior_z=35;

// interior corner radius in mm
radius=0; // [0:20]

// What fraction of the flat X side should the hook take up? (0 for no hook)
x_hook_fraction = 0.5; // [0:0.1:1.0]

// What fraction of the flat Y side should the hook take up? (0 for no hook)
y_hook_fraction = 0.5; // [0:0.1:1.0]

// What fraction of the hooks should have a slot behind them? (0 for no slot)
slot_length = 0.7; // [0:0.1:1]

/* Hidden */
$fn=100;

wall_thickness=nozzle_size*number_of_walls;

// Outer dimensions
x = interior_x + 2 * wall_thickness;
y = interior_y + 2 * wall_thickness;
z = interior_z + 2 * wall_thickness;

hook_thickness = 3 * nozzle_size;

top_cover_wall_thickness = hook_thickness + wall_thickness;

y_hook_length = (y - 2 * radius) * y_hook_fraction;
x_hook_length = (x - 2 * radius) * x_hook_fraction;

module box_interior () {
    offset(r=radius) {
        square([interior_x-2*radius, interior_y-2*radius], center=true);
    }
}

module box_exterior () {
    offset(r=wall_thickness) {
        box_interior();
    }
}

module bottom_box () {
    difference(){
        // Solid box
        linear_extrude(z-wall_thickness){
            box_exterior();
        }
        
        // Hollow out
        translate([0,0,wall_thickness]) linear_extrude(z){
            box_interior();
        }
        left_slot();
        rotate([180,180,0]) left_slot(); // right slot
        front_slot();
        rotate([180,180,0]) front_slot(); // back slot
    }
    left_hook(); // left hook
    rotate([180,180,0]) left_hook(); // right hook
    front_hook(); // front hook
    rotate([180,180,0]) front_hook(); // back hook
}

module left_hook () {
    translate([(x-2*wall_thickness)/2,-y_hook_length/2,z-wall_thickness]) rotate([0,90,90]) {
        base_hook(y_hook_length);
    }
}

module front_hook () {
    translate([-x_hook_length/2,-y/2+wall_thickness,z-wall_thickness]) rotate([90,90,90]) {
        base_hook(x_hook_length);
    }
}

module base_hook (hook_length) {
    difference(){
        linear_extrude(hook_length){
            polygon(points=[[0,0],[2*hook_thickness,0],[hook_thickness,hook_thickness]]);
        }
        translate([hook_thickness, hook_thickness, 0]) rotate([45,0,0]) cube(2*hook_thickness, center=true);
        translate([hook_thickness, hook_thickness, hook_length]) rotate([45,0,0]) cube(2*hook_thickness, center=true);        
    }
}

module left_slot () {
    slot_length = y_hook_length*slot_length;
    epsilon=2; // ensure it definitely protrudes
    translate([x/2+epsilon,-slot_length/2,z]) rotate([0,90,90]) {
        cube([2*hook_thickness, wall_thickness+epsilon, slot_length]);
    }
}

module front_slot () {
    slot_length = x_hook_length*slot_length;
    epsilon=2; // ensure it definitely protrudes
    translate([-slot_length/2,-y/2-epsilon,z]) rotate([90,90,90]) {
        cube([2*hook_thickness, wall_thickness+epsilon, slot_length]);
    }
}

module right_groove () {
    translate([-tolerance/2+(x-2*wall_thickness)/2,-y_hook_length/2,wall_thickness+hook_thickness*2]) rotate([0,90,90]) linear_extrude(y_hook_length) {
        base_groove();
    }
}


module front_groove () {
    translate([-x_hook_length/2,-y/2+wall_thickness+tolerance/2,wall_thickness+hook_thickness*2]) rotate([90,90,90]) linear_extrude(x_hook_length){
        base_groove();
    }
}

module base_groove () {
    polygon(points=[[0,0],[0, -1], [2*hook_thickness, -1],[2*hook_thickness,0],[hook_thickness,hook_thickness]]);
}

module top_cover () {

    // Top face
    linear_extrude(wall_thickness) {
        box_exterior();
    }
    
    difference(){
        // Wall of top cover
        inset = wall_thickness + tolerance/2;
        linear_extrude(wall_thickness+hook_thickness*2){
            offset(r=-inset) {
                box_exterior();
            }
        }
        
        // Hollow out
        translate([0,0,wall_thickness]) linear_extrude(z){
            offset(r=-wall_thickness*2) {
                offset(r=-inset) {
                    box_exterior();
                }
            }
        }
        
        right_groove();
        rotate([180,180,0]) right_groove();
        front_groove();
        rotate([180,180,0])  front_groove();
    }
  

}

// left_hook();
print_part();

module print_part() {
	if (part == "box") {
		bottom_box();
	} else if (part == "top") {
		top_cover();
	} else if (part == "both") {
		both();
	} else {
		both();
	}
}

module both() {
	translate([0,-(y/2+wall_thickness),0]) bottom_box();
    translate([0,+(y/2+wall_thickness),0]) top_cover();
}