// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

// Split-tree operations. None of them modifies its input: each returns a new
// tree that shares the untouched subtrees.

const (
	minRatio = 0.1
	maxRatio = 0.9
)

func clampRatio(r float64) float64 {
	switch {
	case r < minRatio:
		return minRatio
	case r > maxRatio:
		return maxRatio
	default:
		return r
	}
}

// Leaf builds a leaf node for a pane.
func Leaf(pane PaneID) *SplitNode {
	return &SplitNode{Kind: NodeLeaf, Pane: pane}
}

// CollectLeaves lists the pane ids in left-to-right, depth-first order.
func CollectLeaves(node *SplitNode) []PaneID {
	if node.Kind == NodeLeaf {
		return []PaneID{node.Pane}
	}

	return append(CollectLeaves(node.First), CollectLeaves(node.Second)...)
}

// HasLeaf reports whether pane appears in the tree.
func HasLeaf(node *SplitNode, pane PaneID) bool {
	if node.Kind == NodeLeaf {
		return node.Pane == pane
	}

	return HasLeaf(node.First, pane) || HasLeaf(node.Second, pane)
}

// FirstLeaf returns the first (left- or top-most) pane id.
func FirstLeaf(node *SplitNode) PaneID {
	cur := node
	for cur.Kind == NodeBranch {
		cur = cur.First
	}

	return cur.Pane
}

// SplitLeaf replaces the leaf for target with a branch holding target and
// newPane, giving target the share ratio. The tree is returned unchanged
// when target is not in it.
func SplitLeaf(node *SplitNode, target PaneID, direction SplitDirection, newPane PaneID, ratio float64) *SplitNode {
	if node.Kind == NodeLeaf {
		if node.Pane != target {
			return node
		}

		return &SplitNode{
			Kind:      NodeBranch,
			Direction: direction,
			First:     node,
			Second:    Leaf(newPane),
			Ratio:     clampRatio(ratio),
		}
	}

	if HasLeaf(node.First, target) {
		branch := *node
		branch.First = SplitLeaf(node.First, target, direction, newPane, ratio)

		return &branch
	}

	if HasLeaf(node.Second, target) {
		branch := *node
		branch.Second = SplitLeaf(node.Second, target, direction, newPane, ratio)

		return &branch
	}

	return node
}

// RemoveResult is the tree left after removing a leaf (nil when it emptied)
// and the pane to focus next ("" when there is none to suggest).
type RemoveResult struct {
	Root     *SplitNode
	Promoted PaneID
}

// RemoveLeaf removes the leaf for target. Its branch collapses to the
// sibling, and Promoted is the sibling's first leaf, for moving focus there.
func RemoveLeaf(node *SplitNode, target PaneID) RemoveResult {
	if node.Kind == NodeLeaf {
		if node.Pane == target {
			return RemoveResult{}
		}

		return RemoveResult{Root: node}
	}

	if node.First.Kind == NodeLeaf && node.First.Pane == target {
		return RemoveResult{Root: node.Second, Promoted: FirstLeaf(node.Second)}
	}

	if node.Second.Kind == NodeLeaf && node.Second.Pane == target {
		return RemoveResult{Root: node.First, Promoted: FirstLeaf(node.First)}
	}

	if HasLeaf(node.First, target) {
		r := RemoveLeaf(node.First, target)
		if r.Root == nil {
			return RemoveResult{Root: node.Second, Promoted: FirstLeaf(node.Second)}
		}

		branch := *node
		branch.First = r.Root

		return RemoveResult{Root: &branch, Promoted: r.Promoted}
	}

	if HasLeaf(node.Second, target) {
		r := RemoveLeaf(node.Second, target)
		if r.Root == nil {
			return RemoveResult{Root: node.First, Promoted: FirstLeaf(node.First)}
		}

		branch := *node
		branch.Second = r.Root

		return RemoveResult{Root: &branch, Promoted: r.Promoted}
	}

	return RemoveResult{Root: node}
}

// ResizeFocused grows or shrinks target's area by delta (a ratio fraction such
// as 0.05) through the deepest enclosing branch whose axis matches direction.
// The sign depends on the direction alone: right and down grow First, left
// and up shrink it. The same tree is returned when nothing changes.
func ResizeFocused(node *SplitNode, target PaneID, direction Direction, delta float64) *SplitNode {
	if node.Kind == NodeLeaf {
		return node
	}

	inFirst := HasLeaf(node.First, target)
	if !inFirst && !HasLeaf(node.Second, target) {
		return node
	}

	child := node.Second
	if inFirst {
		child = node.First
	}

	if adjusted := ResizeFocused(child, target, direction, delta); adjusted != child {
		branch := *node
		if inFirst {
			branch.First = adjusted
		} else {
			branch.Second = adjusted
		}

		return &branch
	}

	axis := SplitHorizontal
	if direction == DirectionLeft || direction == DirectionRight {
		axis = SplitVertical
	}

	if node.Direction != axis {
		return node
	}

	sign := -1.0
	if direction == DirectionRight || direction == DirectionDown {
		sign = 1.0
	}

	branch := *node
	branch.Ratio = clampRatio(node.Ratio + sign*delta)

	return &branch
}
