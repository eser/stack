package lib

func ArraysCopy[T any](items ...[]T) []T {
	var totalLength int
	for _, slice := range items {
		totalLength += len(slice)
	}

	newCopy := make([]T, totalLength)

	var currentIndex int
	for _, slice := range items {
		copy(newCopy[currentIndex:], slice)
		currentIndex += len(slice)
	}

	return newCopy
}
