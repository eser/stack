// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import "math"

// Chrome is the screen area reserved around the panes: the full-width tab
// bar and status bar, and optional decoration bands (a sidebar, a status
// strip) on each side. The server lays panes out with it and frontends draw
// decorations into the same regions, so both must use the same Chrome.
type Chrome struct {
	TabBarRows    int `json:"tabBarRows"`
	StatusBarRows int `json:"statusBarRows"`
	LeftCols      int `json:"leftCols"`
	RightCols     int `json:"rightCols"`
	TopRows       int `json:"topRows"`
	BottomRows    int `json:"bottomRows"`
}

// DefaultChrome is one row for the tab bar and one for the status bar.
func DefaultChrome() Chrome {
	return Chrome{TabBarRows: 1, StatusBarRows: 1}
}

const (
	minPaneCols = 10
	minPaneRows = 3
	ratioScale  = 100
)

// EffectiveChrome drops decoration bands that would starve the pane area, so
// a small terminal still shows panes. The server lays out with it and sends
// it in the scene, so frontends draw decorations to match.
func EffectiveChrome(viewport Viewport, chrome Chrome) Chrome {
	out := chrome

	if viewport.Cols-out.LeftCols-out.RightCols < minPaneCols {
		out.LeftCols = 0
		out.RightCols = 0
	}

	vertical := out.TabBarRows + out.StatusBarRows + out.TopRows + out.BottomRows
	if viewport.Rows-vertical < minPaneRows {
		out.TopRows = 0
		out.BottomRows = 0
	}

	return out
}

// Region is a screen rectangle in 1-based coordinates, ready for drawing.
type Region struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

// DecorationRegions are the reserved bands of a Chrome; a nil field means the
// band is not reserved.
type DecorationRegions struct {
	Left   *Region `json:"left,omitempty"`
	Right  *Region `json:"right,omitempty"`
	Top    *Region `json:"top,omitempty"`
	Bottom *Region `json:"bottom,omitempty"`
}

// ComputeDecorationRegions returns the 1-based rectangles a Chrome reserves.
// The side bands span the content height; the top and bottom bands sit
// between them.
func ComputeDecorationRegions(viewport Viewport, chrome Chrome) DecorationRegions {
	bandY := chrome.TabBarRows + 1
	bandH := max(0, viewport.Rows-chrome.TabBarRows-chrome.StatusBarRows)
	innerX := chrome.LeftCols + 1
	innerW := max(0, viewport.Cols-chrome.LeftCols-chrome.RightCols)

	var regions DecorationRegions

	if chrome.LeftCols > 0 {
		regions.Left = &Region{X: 1, Y: bandY, Width: chrome.LeftCols, Height: bandH}
	}

	if chrome.RightCols > 0 {
		regions.Right = &Region{X: viewport.Cols - chrome.RightCols + 1, Y: bandY, Width: chrome.RightCols, Height: bandH}
	}

	if chrome.TopRows > 0 {
		regions.Top = &Region{X: innerX, Y: bandY, Width: innerW, Height: chrome.TopRows}
	}

	if chrome.BottomRows > 0 {
		regions.Bottom = &Region{
			X:      innerX,
			Y:      viewport.Rows - chrome.StatusBarRows - chrome.BottomRows + 1,
			Width:  innerW,
			Height: chrome.BottomRows,
		}
	}

	return regions
}

// splitGrows turns a branch ratio into the two flex weights the TypeScript
// layout used, so pane sizes round the same way.
func splitGrows(ratio float64) (int, int) {
	first := max(1, int(math.Round(ratio*ratioScale)))
	second := max(1, int(math.Round((1-ratio)*ratioScale)))

	return first, second
}

// layoutNode places the panes of a subtree in rect. Each branch divides its
// main axis by flex weights: the first child gets the floor of its share and
// the second the rest.
func layoutNode(node *SplitNode, rect Geom, out map[PaneID]Geom) {
	if node.Kind == NodeLeaf {
		out[node.Pane] = rect

		return
	}

	firstGrow, secondGrow := splitGrows(node.Ratio)
	total := firstGrow + secondGrow

	main := rect.Height
	if node.Direction == SplitVertical {
		main = rect.Width
	}

	firstSize, secondSize := 0, 0
	if main > 0 {
		firstSize = int(math.Floor(float64(main) * (float64(firstGrow) / float64(total))))
		secondSize = main - firstSize
	}

	first, second := rect, rect

	if node.Direction == SplitVertical {
		first.Width = firstSize
		second.X = rect.X + firstSize
		second.Width = secondSize
	} else {
		first.Height = firstSize
		second.Y = rect.Y + firstSize
		second.Height = secondSize
	}

	layoutNode(node.First, first, out)
	layoutNode(node.Second, second, out)
}

// ComputeTabGeoms lays out every pane of a tab. A fullscreen pane is the only
// one returned and fills the content area.
func ComputeTabGeoms(tab *Tab, viewport Viewport, chrome Chrome) map[PaneID]Geom {
	content := Geom{
		X:      chrome.LeftCols,
		Y:      chrome.TabBarRows + chrome.TopRows,
		Width:  max(0, viewport.Cols-chrome.LeftCols-chrome.RightCols),
		Height: max(0, viewport.Rows-chrome.TabBarRows-chrome.StatusBarRows-chrome.TopRows-chrome.BottomRows),
	}

	if tab.FullscreenPane != "" {
		return map[PaneID]Geom{tab.FullscreenPane: content}
	}

	out := map[PaneID]Geom{}
	layoutNode(tab.Root, content, out)

	return out
}

// NeighborInDirection picks the pane next to from in direction, among panes
// that overlap it on the other axis so focus never jumps diagonally. order is
// the tab's leaf order ([CollectLeaves]); on a tie the earlier pane wins. It
// returns "" when there is none.
func NeighborInDirection(geoms map[PaneID]Geom, order []PaneID, from PaneID, direction Direction) PaneID {
	self, ok := geoms[from]
	if !ok {
		return ""
	}

	horizontal := direction == DirectionLeft || direction == DirectionRight
	before := direction == DirectionLeft || direction == DirectionUp

	selfCenter := float64(self.Y) + float64(self.Height)/2
	if horizontal {
		selfCenter = float64(self.X) + float64(self.Width)/2
	}

	var best PaneID

	bestDist := math.Inf(1)

	for _, id := range order {
		g, laidOut := geoms[id]
		if id == from || !laidOut {
			continue
		}

		overlaps := g.X < self.X+self.Width && g.X+g.Width > self.X
		if horizontal {
			overlaps = g.Y < self.Y+self.Height && g.Y+g.Height > self.Y
		}

		if !overlaps {
			continue
		}

		center := float64(g.Y) + float64(g.Height)/2
		if horizontal {
			center = float64(g.X) + float64(g.Width)/2
		}

		if (before && center >= selfCenter) || (!before && center <= selfCenter) {
			continue
		}

		if dist := math.Abs(center - selfCenter); dist < bestDist {
			bestDist = dist
			best = id
		}
	}

	return best
}
