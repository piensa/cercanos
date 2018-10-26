// Before running ths, we need:
// npm install papaparse flatbush progress geographiclib
//
const papa = require('papaparse');
const Flatbush = require('flatbush');
const fs = require('fs');
const ProgressBar = require('progress');
const GeographicLib = require('geographiclib');
const args = require('minimist')(process.argv.slice(2));

const regions = JSON.parse(fs.readFileSync(args.r));

function createIndexFromFile(filename) {
    let contents =  JSON.parse(fs.readFileSync(filename));
    let count = contents.features.length;
    let index = new Flatbush(count);
    let data = new Array(count);

    let bar = new ProgressBar(`Loading ${filename} [:bar] :rate/pps :percent :etas (${count} items)`, {
        complete: '=',
        incomplete: ' ',
        width: 40,
        total: count
    });

    for (let [currentIndex, feature] of contents.features.entries()) {
        bar.tick(1);
        let d = feature.properties;
        data[currentIndex] = d;
        index.add(d.x, d.y, d.x, d.y);
    }

    index.finish();

    return {
        index,
        data
    }

}

const geod = GeographicLib.Geodesic.WGS84;

function distance(lat1, lon1, lat2, lon2){
   let r = geod.Inverse(lat1, lon1, lat2, lon2);
   return Number(r.s12.toFixed(3));
}

function best(x, y, items) {
  let best_item = items[0];
  let best_d = distance(y, x, best_item.y, best_item.x);
  for (let i=0; i < items.length; i++ ) {
    let new_d = distance(y, x, items[i].y, items[i].x);
    if (new_d < best_d) {
      best_d = new_d;
      best_item = items[i];
    }
  }
 return best_item;
}

function nn(){
    const d = 0.00045;
    // half-line distance
    // d=100 m,
    const dx = d*4;
    const dy = d*4;
    // const dx = 0.0064; // 0.7 km lon
    // const dy = 0.0063; // 0.7 km lat

    // read file
    const cluster500 = createIndexFromFile(args.c);

    const targets = {}

    for (let target of args.t) {
        targets[target.replace('.geojson','')] = createIndexFromFile(target);
    }

    const region_population = {};

    let pbar = new ProgressBar('Loading population [:bar] :rate/pps :percent :etas', {
            complete: '=',
            incomplete: ' ',
            width: 40,
            total: regions.features.length
    });

    for (let i = 0; i < regions.features.length; i++){
        pbar.tick(1);
        let w = regions.features[i].properties;
        region_population[w.W_CODE] = {code: w.W_CODE, population: w.Pop2007, density: w.Density, area: w.Area};
    }



    let dataLength = cluster500.data.length;
    let clusters = [];
    let bar = new ProgressBar('Processing clusters [:bar] :rate/pps :percent :etas', {
        complete: '=',
        incomplete: ' ',
        width: 40,
        total: dataLength
    });

    for(let i = 0; i < dataLength; ++i) {
        bar.tick(1);
        let c = cluster500.data[i];

    	let meanX = c.x;
        let meanY = c.y;

        let candidates = 10;

        let g_all = targets.grid.index.neighbors(meanX, meanY, candidates).map((i) => targets.grid.data[i]);
        let s_all = targets.schools.index.neighbors(meanX, meanY, candidates).map((i) => targets.schools.data[i]);
        let h_all = targets.health.index.neighbors(meanX, meanY, candidates).map((i) => targets.health.data[i]);
        let r1_all = targets.roads1.index.neighbors(meanX, meanY, candidates).map((i) => targets.roads1.data[i]);
        let r2_all = targets.roads2.index.neighbors(meanX, meanY, candidates).map((i) => targets.roads2.data[i]);
        let r3_all = targets.roads3.index.neighbors(meanX, meanY, candidates).map((i) => targets.roads3.data[i]);

	let g = best(c.x, c.y, g_all);
        let s = best(c.x, c.y, s_all);
        let h = best(c.x, c.y, h_all);
        let r1 = best(c.x, c.y, r1_all);
        let r2 = best(c.x, c.y, r2_all);
        let r3 = best(c.x, c.y, r3_all);

        let w = region_population[c.region];
    	let p ={};

    	if (w){
       	    p = {
        	    region_population: region_population[c.region].population,
        	    region_area: region_population[c.region].area,
        	    region_density: region_population[c.region].density,
            }
        }

	let g_dist = distance(meanY, meanX, g.y, g.x);
        let s_dist = distance(meanY, meanX, s.y, s.x);
        let h_dist = distance(meanY, meanX, h.y, h.x);
	let r1_dist = distance(meanY, meanX, r1.y, r1.x);
	let r2_dist = distance(meanY, meanX, r2.y, r2.x);
	let r3_dist = distance(meanY, meanX, r3.y, r3.x);

	let g_error = g_dist - c.DstToLn;
        let s_error = s_dist - c.DstToSchoo;
        let h_error = h_dist - c.DstToHlth;
	let r1_error = r1_dist - c.DstToRd_1;
	let r2_error = r2_dist - c.DstToRd_2;
	let r3_error = r3_dist - c.DstToRd_3;


        let n = {
	    new_grid_x: g.x,
            new_grid_y: g.y,
    	    new_school_x: s.x,
    	    new_school_y: s.y,
    	    new_health_x: h.x,
    	    new_health_y: h.y,
    	    new_health_x: h.x,
	    new_road1_x: r1.x,
    	    new_road1_y: r1.y,
    	    new_road2_x: r2.x,
    	    new_road2_y: r2.y,
    	    new_road3_x: r3.x,
    	    new_road3_y: r3.y,
	    new_grid_distance_centroid: g_dist,
    	    new_school_distance_centroid: s_dist,
    	    new_health_distance_centroid: h_dist,
    	    new_road1_distance_centroid: r1_dist,
    	    new_road2_distance_centroid: r2_dist,
    	    new_road3_distance_centroid: r3_dist,
	    new_grid_error: g_error,
            new_school_error:  s_error,
            new_health_error:  h_error,
	    new_road1_error: r1_error,
	    new_road2_error: r2_error,
	    new_road3_error: r3_error,
	    new_grid_class: g["class"],
            new_school_class: s["class"],
    	    new_health_class: h["class"],
    	    new_road1_class: r1["class"],
    	    new_road2_class: r2["class"],
    	    new_road3_class: r3["class"],
            }

        clusters.push({...c,...n,...p});
    }

    console.log(`Total clusters: ${clusters.length}`);

    let max_grid_error = Math.max(...clusters.map( i => i.new_grid_error));
    let min_grid_error = Math.min(...clusters.map( i => i.new_grid_error));
    let max_school_error = Math.max(...clusters.map( i => i.new_school_error));
    let min_school_error = Math.min(...clusters.map( i => i.new_school_error));
    let max_health_error = Math.max(...clusters.map( i => i.new_health_error));
    let min_health_error = Math.min(...clusters.map( i => i.new_health_error));
    let max_road1_error = Math.max(...clusters.map( i => i.new_road1_error));
    let min_road1_error = Math.min(...clusters.map( i => i.new_road1_error));
    let max_road2_error = Math.max(...clusters.map( i => i.new_road2_error));
    let min_road2_error = Math.min(...clusters.map( i => i.new_road2_error));
    let max_road3_error = Math.max(...clusters.map( i => i.new_road3_error));
    let min_road3_error = Math.min(...clusters.map( i => i.new_road3_error));

    console.log("Grid error (max, min):",  max_grid_error, min_grid_error);
    console.log("School error (max, min):",  max_school_error, min_school_error);
    console.log("Health error (max, min):",  max_health_error, min_health_error);
    console.log("Road 1 error (max, min):",  max_road1_error, min_road1_error);
    console.log("Road 2 error (max, min):",  max_road2_error, min_road2_error);
    console.log("Road 3 error (max, min):",  max_road3_error, min_road3_error);

	let csv = papa.unparse(clusters)
	fs.writeFileSync(args.o, csv);
}

nn();
