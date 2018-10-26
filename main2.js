'use strict';
// Before running ths, we need:
// npm install papaparse flatbush bitset progress
//
const papa = require('papaparse');
const Flatbush = require('flatbush');
const fs = require('fs');
const ProgressBar = require('progress');
const GeographicLib = require('geographiclib');
const args = require('minimist')(process.argv.slice(2));

const woredas = JSON.parse(fs.readFileSync(args.r));

function createIndexFromFile(filename) {
    const contents =  JSON.parse(fs.readFileSync(filename));
    const count = contents.features.length;
    const index = new Flatbush(count);
    const data = new Array(count);

    const bar = new ProgressBar(`Loading ${filename} [:bar] :rate/pps :percent :etas (${count} items)`, {
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


function distance(lat1, lon1, lat2, lon2){
    const geod = GeographicLib.Geodesic.WGS84;
    const r = geod.Inverse(lat1, lon1, lat2, lon2);
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

    const woreda_population = {};

    const pbar = new ProgressBar('Loading population [:bar] :rate/pps :percent :etas', {
        complete: '=',
        incomplete: ' ',
        width: 40,
        total: woredas.features.length
    });

    for (let woredaFeature of woredas.features) {
        pbar.tick(1);
        let w = woredaFeature.properties;
        woreda_population[w.W_CODE] = {code: w.W_CODE, population: w.Pop2007, density: w.Density, area: w.Area};
    }

    const dataLength = cluster500.data.length;
    const clusters = [];
    const bar = new ProgressBar('Processing clusters [:bar] :rate/pps :percent :etas', {
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

        let candidates = 500;

        let s_all = targets.schools.index.neighbors(meanX, meanY, candidates).map((i) => targets.schools.data[i]);
        let h_all = targets.health.index.neighbors(meanX, meanY, candidates).map((i) => targets.health.data[i]);
        let r1_all = targets.roads1.index.neighbors(meanX, meanY, candidates).map((i) => targets.roads1.data[i]);
        let r2_all = targets.roads2.index.neighbors(meanX, meanY, candidates).map((i) => targets.roads2.data[i]);
        let r3_all = targets.roads3.index.neighbors(meanX, meanY, candidates).map((i) => targets.roads3.data[i]);

        let s = best(c.x, c.y, s_all);
        let h = best(c.x, c.y, h_all);
        let r1 = best(c.x, c.y, r1_all);
        let r2 = best(c.x, c.y, r2_all);
        let r3 = best(c.x, c.y, r3_all);

        let w = woreda_population[c.woreda];
    	let p ={};

    	if (w){
            p = {
                woreda_population: woreda_population[c.woreda].population,
                woreda_area: woreda_population[c.woreda].area,
                woreda_density: woreda_population[c.woreda].density,
            }
        }

        let s_dist = distance(meanY, meanX, s.y, s.x);
        let s_error = s_dist - c.DstToSchoo;
        let h_dist = distance(meanY, meanX, h.y, h.x);
        let h_error = h_dist - c.DstToHlth;

        let n = {
            new_school_x: s.x,
            new_school_y: s.y,
            new_school_distance_centroid: s_dist,
            new_school_class: s.type,
            new_school_error:  s_error,
            new_health_x: h.x,
            new_health_y: h.y,
            new_health_error:  h_error,
            new_health_x: h.x,
            new_health_distance_centroid: distance(meanX, meanY, h.x, h.y),
            new_health_class: h.type,
            new_road1_x: r1.x,
            new_road1_y: r1.y,
            new_road1_distance_centroid: distance(meanX, meanY, r1.x, r1.y),
            new_road1_class: r1.type,
            new_road2_x: r2.x,
            new_road2_y: r2.y,
            new_road2_distance_centroid: distance(meanX, meanY, r2.x, r2.y),
            new_road2_class: r2.type,
            new_road3_x: r3.x,
            new_road3_y: r3.y,
            new_road3_distance_centroid: distance(meanX, meanY, r3.x, r3.y),
            new_road3_class: r3.type,
        }

        clusters.push({...c,...n,...p});
    }

    console.log(`Total clusters: ${clusters.length}`);

    let max_school_error = Math.max(...clusters.map( i => i.new_school_error));
    let min_school_error = Math.min(...clusters.map( i => i.new_school_error));
    let max_health_error = Math.max(...clusters.map( i => i.new_health_error));
    let min_health_error = Math.min(...clusters.map( i => i.new_health_error));

	let csv = papa.unparse(clusters)

	fs.writeFileSync(args.o, csv);
}

nn();
